import { sign, verify } from "hono/jwt";
import { env } from "../env.js";

export const SESSION_COOKIE = "laya_session";
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
  username: string;
  exp: number;
}

export async function createSessionToken(username: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  return sign({ username, exp }, env.SESSION_SECRET);
}

// Returns the payload, or null if the token is missing/invalid/expired.
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const payload = await verify(token, env.SESSION_SECRET, "HS256");
    return { username: String(payload.username), exp: Number(payload.exp) };
  } catch {
    return null;
  }
}
