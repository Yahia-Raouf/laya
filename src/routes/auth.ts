import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { audit } from "../audit.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  createSessionToken,
  verifySessionToken,
} from "../auth/session.js";
import type { AppEnv } from "../types.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = new Hono<AppEnv>();

authRouter.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid body" }, 400);
  const { username, password } = parsed.data;

  const user = await prisma.adminUser.findUnique({ where: { username } });
  // Compare against a dummy hash when the user is missing to keep timing even.
  const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) return c.json({ error: "invalid credentials" }, 401);

  const token = await createSessionToken(username);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  await audit(`portal:${username}`, "auth.login");
  return c.json({ ok: true, username });
});

authRouter.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRouter.get("/session", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ authenticated: false });
  const payload = await verifySessionToken(token);
  return c.json(
    payload
      ? { authenticated: true, username: payload.username }
      : { authenticated: false },
  );
});
