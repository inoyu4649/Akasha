import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { prisma } from "../config/prisma.js";

const router = Router();

// GET /api/conversations — list user's conversations (most recent first)
router.get("/", requireAuth, async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { id: true, title: true, updatedAt: true },
  });
  res.json({ conversations });
});

// GET /api/conversations/:id — get conversation with messages
router.get("/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: req.user!.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, modelName: true, createdAt: true },
      },
    },
  });

  if (!conversation) { res.status(404).json({ error: "NOT_FOUND" }); return; }
  res.json({ conversation });
});

// DELETE /api/conversations/:id
router.delete("/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

  const deleted = await prisma.conversation.deleteMany({
    where: { id, userId: req.user!.id },
  });

  if (deleted.count === 0) { res.status(404).json({ error: "NOT_FOUND" }); return; }
  res.json({ ok: true });
});

export default router;
