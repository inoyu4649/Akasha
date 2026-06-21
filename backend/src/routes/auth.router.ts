import { Router } from "express";
import type { Response } from "express";
import type { User } from "@prisma/client";
import passport from "../config/passport.js";
import { signAccess, signRefresh, verifyRefresh } from "../utils/jwt.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { prisma } from "../config/prisma.js";

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5174";
const isProd = process.env.NODE_ENV === "production";

const COOKIE_BASE = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "strict" : "lax") as "strict" | "lax",
};

function setAuthCookies(res: Response, user: User) {
  const access = signAccess({ sub: user.id, email: user.email, role: user.role });
  const refresh = signRefresh({ sub: user.id });

  res.cookie("akasha_token", access, {
    ...COOKIE_BASE,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("akasha_refresh", refresh, {
    ...COOKIE_BASE,
    path: "/api/auth/refresh",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.get(
  "/google",
  passport.authenticate("google", { session: false, scope: ["profile", "email"] })
);

router.get("/google/callback", (req, res, next) => {
  passport.authenticate(
    "google",
    { session: false },
    (err: Error | null, user: User | false, info?: { message?: string }) => {
      if (err || !user) {
        const code = info?.message ?? "OAUTH_FAILED";
        return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(code)}`);
      }
      setAuthCookies(res, user);
      res.redirect(FRONTEND_URL);
    }
  )(req, res, next);
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      name: true,
      picture: true,
      role: true,
      dailyCredits: true,
      isActive: true,
    },
  });
  if (!user || !user.isActive) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  res.json({ user });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.akasha_refresh as string | undefined;
  if (!token) {
    res.status(401).json({ error: "NO_REFRESH_TOKEN" });
    return;
  }
  try {
    const { sub } = verifyRefresh(token);
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user || !user.isActive) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    setAuthCookies(res, user);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("akasha_token", COOKIE_BASE);
  res.clearCookie("akasha_refresh", { ...COOKIE_BASE, path: "/api/auth/refresh" });
  res.json({ ok: true });
});

export default router;
