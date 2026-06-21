import type { Request, Response, NextFunction } from "express";
import { verifyAccess } from "../utils/jwt.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.akasha_token as string | undefined;
  if (!token) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  try {
    const payload = verifyAccess(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "TOKEN_EXPIRED" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "ADMIN") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    next();
  });
}
