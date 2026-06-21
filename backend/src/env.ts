// This module MUST be the very first import in index.ts.
// In ESM, sibling imports are evaluated in source order, so importing this
// first guarantees .env is loaded before any module that reads process.env.
//
// We use import.meta.url to resolve the path relative to this file (not CWD),
// which is critical because tsx runs from the backend/ workspace directory
// while .env lives at the monorepo root.
//
// override: true ensures tsx watch hot-reloads always pick up the latest
// values even if process.env already has stale (empty) entries from startup.

import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const dir = path.dirname(fileURLToPath(import.meta.url)); // backend/src
const envPath = path.resolve(dir, "../../.env");           // monorepo root

const result = dotenv.config({ path: envPath, override: true });
if (result.error) {
  console.warn("[env] .env not found at", envPath, "—", result.error.message);
} else {
  console.log("[env] loaded", Object.keys(result.parsed ?? {}).length, "vars from", envPath);
}
