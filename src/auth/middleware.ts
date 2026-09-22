import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { hashApiKey } from "./keys.js";
import { SESSION_COOKIE, verifySessionToken } from "./session.js";
import type { AppEnv } from "../types.js";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function bearer(c: Context): string | null {
  const auth = c.req.header("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

// Admin API: master secret (X-Admin-Secret or Bearer) OR a valid portal session.
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const secret = c.req.header("x-admin-secret") ?? bearer(c);
  if (secret && safeEqual(secret, env.LAYA_ADMIN_SECRET)) {
    c.set("actor", "secret");
    return next();
  }
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
      c.set("actor", `portal:${payload.username}`);
      return next();
    }
  }
  return c.json({ error: "unauthorized" }, 401);
}

// Inference API: a caller API key via X-API-Key or Bearer.
export async function requireApiKey(c: Context<AppEnv>, next: Next) {
  const presented = c.req.header("x-api-key") ?? bearer(c);
  if (!presented) return c.json({ error: "missing API key" }, 401);

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(presented) },
  });
  if (!record) return c.json({ error: "invalid API key" }, 401);
  if (record.status !== "ACTIVE") return c.json({ error: "key is inactive" }, 403);
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    return c.json({ error: "key has expired" }, 403);
  }
  if (record.quotaTotal !== null && record.quotaUsed >= record.quotaTotal) {
    return c.json({ error: "quota exceeded" }, 403);
  }

  c.set("apiKey", record);
  return next();
}
