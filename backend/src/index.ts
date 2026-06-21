import "./env.js"; // MUST be first — loads .env before any other module reads process.env
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { initPassport } from "./config/passport.js";
import authRouter from "./routes/auth.router.js";
import chatRouter from "./routes/chat.router.js";
import ollamaRouter from "./routes/ollama.router.js";
import conversationsRouter from "./routes/conversations.router.js";
import adminRouter from "./routes/admin.router.js";

initPassport(); // env already loaded by ./env.js import above

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: isProd ? undefined : false,
    crossOriginEmbedderPolicy: false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5174",
    credentials: true,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" },
  })
);

// Tighter limit for auth endpoints to prevent OAuth spam
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" },
});

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRateLimit, authRouter);
app.use("/api/chat", chatRouter);
app.use("/api/ollama", ollamaRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/admin", adminRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[express error]", err);
  if (!res.headersSent) {
    const status = (err as { status?: number })?.status ?? 500;
    const message = (err as { message?: string })?.message ?? "SERVER_ERROR";
    res.status(status).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Akasha backend running on port ${PORT} [${isProd ? "production" : "development"}]`);
});

export default app;
