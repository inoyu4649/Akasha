import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { ollama } from "../services/ollama.service.js";
import { prisma } from "../config/prisma.js";

const router = Router();

// GET /api/ollama/status — Ollama availability + currently loaded model
router.get("/status", requireAuth, async (_req, res) => {
  const status = await ollama.getStatus();
  res.json(status);
});

// GET /api/ollama/models — enabled models from DB merged with installed check
router.get("/models", requireAuth, async (_req, res) => {
  const [dbModels, installedNames] = await Promise.all([
    prisma.modelConfig.findMany({
      where: { enabled: true },
      select: { modelName: true, creditCost: true },
      orderBy: { creditCost: "asc" },
    }),
    ollama.getInstalledModels(),
  ]);

  const installedSet = new Set(installedNames);
  const models = dbModels.map((m) => ({
    modelName: m.modelName,
    creditCost: m.creditCost,
    installed: installedSet.has(m.modelName),
  }));

  res.json({ models });
});

export default router;
