import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { ollama, inferenceQueue, type OllamaMessage } from "../services/ollama.service.js";
import { prisma } from "../config/prisma.js";

const router = Router();

const MAX_CONTENT_LENGTH = 8000;
const MAX_QUEUE_DEPTH = 5;

// GET /api/chat/credits — today's credit usage for the current user
router.get("/credits", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { role: true, dailyCredits: true },
  });
  if (!user) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

  if (user.role === "ADMIN") {
    res.json({ used: 0, limit: null, isAdmin: true });
    return;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { _sum } = await prisma.usageLog.aggregate({
    where: { userId: req.user!.id, createdAt: { gte: todayStart } },
    _sum: { creditsUsed: true },
  });

  res.json({ used: _sum.creditsUsed ?? 0, limit: user.dailyCredits, isAdmin: false });
});

// POST /api/chat — SSE streaming chat
// Body: { model: string, content: string, conversationId?: number }
router.post("/", requireAuth, async (req, res) => {
  const { model, content, conversationId } = req.body as {
    model?: string;
    content?: string;
    conversationId?: number | null;
  };

  if (!model || typeof model !== "string") {
    res.status(400).json({ error: "MISSING_MODEL" });
    return;
  }
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "MISSING_CONTENT" });
    return;
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: "CONTENT_TOO_LONG", maxLength: MAX_CONTENT_LENGTH });
    return;
  }

  // Reject early if queue is already backed up
  if (inferenceQueue.queueDepth >= MAX_QUEUE_DEPTH) {
    res.status(503).json({ error: "QUEUE_FULL" });
    return;
  }

  // Validate model
  const modelConfig = await prisma.modelConfig.findUnique({
    where: { modelName: model },
    select: { enabled: true, creditCost: true },
  });
  if (!modelConfig || !modelConfig.enabled) {
    res.status(400).json({ error: "MODEL_NOT_AVAILABLE" });
    return;
  }

  // Validate conversation ownership
  let convId: number | null = conversationId ? Number(conversationId) : null;
  if (convId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: convId, userId: req.user!.id },
      select: { id: true },
    });
    if (!conv) { res.status(404).json({ error: "CONVERSATION_NOT_FOUND" }); return; }
  }

  // Fetch user and check credits
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { role: true, dailyCredits: true, isActive: true },
  });
  if (!user || !user.isActive) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }

  if (user.role !== "ADMIN") {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { _sum } = await prisma.usageLog.aggregate({
      where: { userId: req.user!.id, createdAt: { gte: todayStart } },
      _sum: { creditsUsed: true },
    });
    const usedToday = _sum.creditsUsed ?? 0;
    if (usedToday + modelConfig.creditCost > user.dailyCredits) {
      res.status(429).json({
        error: "CREDITS_EXHAUSTED",
        creditsUsed: usedToday,
        creditsLimit: user.dailyCredits,
      });
      return;
    }
  }

  // Load conversation history for context (last 20 messages)
  const history: OllamaMessage[] = [];
  if (convId) {
    const recent = await prisma.message.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { role: true, content: true },
    });
    history.push(...recent.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })));
  }

  const messages: OllamaMessage[] = [...history, { role: "user", content: content.trim() }];

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (data: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    await inferenceQueue.enqueue(async () => {
      if (abortController.signal.aborted) return;

      let fullContent = "";

      await ollama.chat(model, messages, (chunk) => {
        fullContent += chunk;
        sendEvent({ type: "chunk", content: chunk });
      }, abortController.signal);

      // Don't save if client disconnected mid-stream
      if (abortController.signal.aborted) return;

      // Create or update conversation
      if (!convId) {
        const title = content.trim().slice(0, 60);
        const conv = await prisma.conversation.create({
          data: { userId: req.user!.id, title },
        });
        convId = conv.id;
      } else {
        await prisma.conversation.update({
          where: { id: convId },
          data: { updatedAt: new Date() },
        });
      }

      // Save messages
      await prisma.message.createMany({
        data: [
          { conversationId: convId, role: "user", content: content.trim(), modelName: model },
          { conversationId: convId, role: "assistant", content: fullContent, modelName: model },
        ],
      });

      // Log usage (skip admin)
      if (user.role !== "ADMIN") {
        await prisma.usageLog.create({
          data: { userId: req.user!.id, modelName: model, creditsUsed: modelConfig.creditCost },
        });
      }

      sendEvent({ type: "done", conversationId: convId });
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if ((err as Error).name === "AbortError") {
      // no-op: client disconnected
    } else if (msg === "OUT_OF_MEMORY") {
      console.error("[chat] OOM for model", model);
      sendEvent({ type: "error", error: "OUT_OF_MEMORY" });
    } else if (msg === "OLLAMA_UNREACHABLE") {
      sendEvent({ type: "error", error: "OLLAMA_UNREACHABLE" });
    } else {
      console.error("[chat] inference error:", err);
      sendEvent({ type: "error", error: "INFERENCE_FAILED" });
    }
  } finally {
    res.end();
  }
});

export default router;
