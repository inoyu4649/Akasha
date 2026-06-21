import jwt from "jsonwebtoken";

interface AccessPayload {
  sub: number;
  email: string;
  role: string;
}

interface RefreshPayload {
  sub: number;
}

function accessSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not set");
  return s;
}

function refreshSecret() {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error("JWT_REFRESH_SECRET not set");
  return s;
}

export function signAccess(payload: AccessPayload): string {
  return jwt.sign(payload, accessSecret(), { expiresIn: 15 * 60 });
}

export function signRefresh(payload: RefreshPayload): string {
  return jwt.sign(payload, refreshSecret(), { expiresIn: 7 * 24 * 60 * 60 });
}

export function verifyAccess(token: string): AccessPayload {
  return jwt.verify(token, accessSecret()) as unknown as AccessPayload;
}

export function verifyRefresh(token: string): RefreshPayload {
  return jwt.verify(token, refreshSecret()) as unknown as RefreshPayload;
}
