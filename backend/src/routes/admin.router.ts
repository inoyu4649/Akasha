import { Router } from "express";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { prisma } from "../config/prisma.js";
import { ollama, inferenceQueue } from "../services/ollama.service.js";

const router = Router();

// All admin routes require ADMIN role
router.use(requireAdmin);

// ── GET /api/admin/users ───────────────────────────────────────────────────
// All users with today's credit usage
router.get("/users", async (_req, res) => {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      picture: true,
      role: true,
      dailyCredits: true,
      isActive: true,
      createdAt: true,
      usageLogs: {
        where: { createdAt: { gte: todayStart } },
        select: { creditsUsed: true },
      },
      _count: { select: { conversations: true } },
    },
  });

  const result = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    picture: u.picture,
    role: u.role,
    dailyCredits: u.dailyCredits,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    todayUsed: u.usageLogs.reduce((sum, l) => sum + l.creditsUsed, 0),
    conversationCount: u._count.conversations,
  }));

  res.json({ users: result });
});

// ── PATCH /api/admin/users/:id ─────────────────────────────────────────────
// Update dailyCredits / isActive / role
router.patch("/users/:id", async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

  const { dailyCredits, isActive, role } = req.body as {
    dailyCredits?: number;
    isActive?: boolean;
    role?: "USER" | "ADMIN";
  };

  const data: Record<string, unknown> = {};
  if (dailyCredits !== undefined) {
    const v = Number(dailyCredits);
    if (!Number.isInteger(v) || v < 0) { res.status(400).json({ error: "INVALID_DAILY_CREDITS" }); return; }
    data.dailyCredits = v;
  }
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (role !== undefined && (role === "USER" || role === "ADMIN")) data.role = role;

  if (Object.keys(data).length === 0) { res.status(400).json({ error: "NO_FIELDS" }); return; }

  const user = await prisma.user.update({ where: { id }, data });
  res.json({ user: { id: user.id, dailyCredits: user.dailyCredits, isActive: user.isActive, role: user.role } });
});

// ── GET /api/admin/stats ───────────────────────────────────────────────────
// Usage stats: per day (last 7d) + per model (last 7d)
router.get("/stats", async (_req, res) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  type DailyRow = { date: Date | string; totalCredits: bigint | number; requests: bigint | number };
  type ModelRow  = { modelName: string;  totalCredits: bigint | number; requests: bigint | number };

  const [dailyRaw, modelRaw] = await Promise.all([
    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE(created_at) AS date,
             SUM(credits_used) AS totalCredits,
             COUNT(*)          AS requests
      FROM usage_logs
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY date
    `,
    prisma.$queryRaw<ModelRow[]>`
      SELECT model_name AS modelName,
             SUM(credits_used) AS totalCredits,
             COUNT(*)          AS requests
      FROM usage_logs
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY model_name
      ORDER BY totalCredits DESC
    `,
  ]);

  const daily = dailyRaw.map((r) => ({
    date: (r.date instanceof Date ? r.date.toISOString() : String(r.date)).slice(0, 10),
    totalCredits: Number(r.totalCredits),
    requests: Number(r.requests),
  }));

  const byModel = modelRaw.map((r) => ({
    modelName: r.modelName,
    totalCredits: Number(r.totalCredits),
    requests: Number(r.requests),
  }));

  res.json({ daily, byModel });
});

// ── GET /api/admin/system ──────────────────────────────────────────────────
// Ollama status + server summary
router.get("/system", async (_req, res) => {
  const [ollamaStatus, totalUsers, activeToday] = await Promise.all([
    ollama.getStatus(),
    prisma.user.count(),
    (async () => {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const rows = await prisma.usageLog.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: todayStart } },
      });
      return rows.length;
    })(),
  ]);

  res.json({
    ollama: ollamaStatus,
    queueDepth: inferenceQueue.queueDepth,
    totalUsers,
    activeToday,
  });
});

export default router;
