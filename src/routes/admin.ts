import { Hono } from "hono";
import { z } from "zod";
import type { ApiKey } from "@prisma/client";
import { prisma } from "../db.js";
import { audit } from "../audit.js";
import { requireAdmin } from "../auth/middleware.js";
import { KEY_DEFAULTS, QUESTION_TYPES, generateApiKey } from "../auth/keys.js";
import type { AppEnv } from "../types.js";

const DAY_MS = 86_400_000;

export const adminRouter = new Hono<AppEnv>();
adminRouter.use("*", requireAdmin);

const scopeSchema = z.array(z.enum(QUESTION_TYPES)).nonempty();

// Public shape of a key (never leaks keyHash), with a computed effective status.
function publicKey(k: ApiKey) {
  const expired = !!(k.expiresAt && k.expiresAt.getTime() < Date.now());
  const effectiveStatus =
    k.status !== "ACTIVE" ? "INACTIVE" : expired ? "EXPIRED" : "ACTIVE";
  return {
    id: k.id,
    label: k.label,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    status: k.status,
    effectiveStatus,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
    rateLimitPerMin: k.rateLimitPerMin,
    quotaTotal: k.quotaTotal,
    quotaUsed: k.quotaUsed,
    quotaRemaining: k.quotaTotal === null ? null : Math.max(0, k.quotaTotal - k.quotaUsed),
    lastUsedAt: k.lastUsedAt,
  };
}

function pageParams(c: { req: { query: (k: string) => string | undefined } }) {
  const limit = Math.min(Math.max(1, Number(c.req.query("limit")) || 50), 200);
  const cursor = c.req.query("cursor");
  return { limit, cursor };
}

// --- create ---
const createSchema = z.object({
  label: z.string().min(1),
  scopes: scopeSchema.optional(),
  expiresInDays: z.number().int().positive().nullable().optional(), // null = never
  rateLimitPerMin: z.number().int().positive().optional(),
  quotaTotal: z.number().int().positive().nullable().optional(), // null = unlimited
});

adminRouter.post("/keys", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  }
  const d = parsed.data;
  const { key, hash, prefix } = generateApiKey();

  const expiresInDays =
    d.expiresInDays === undefined ? KEY_DEFAULTS.expiresInDays : d.expiresInDays;
  const expiresAt =
    expiresInDays === null ? null : new Date(Date.now() + expiresInDays * DAY_MS);

  const record = await prisma.apiKey.create({
    data: {
      label: d.label,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: d.scopes ?? KEY_DEFAULTS.scopes,
      expiresAt,
      rateLimitPerMin: d.rateLimitPerMin ?? KEY_DEFAULTS.rateLimitPerMin,
      quotaTotal: d.quotaTotal === undefined ? KEY_DEFAULTS.quotaTotal : d.quotaTotal,
    },
  });
  await audit(c.get("actor") ?? "unknown", "key.create", record.id, {
    label: record.label,
  });
  // The full key is returned exactly once, here.
  return c.json({ ...publicKey(record), key }, 201);
});

// --- list ---
adminRouter.get("/keys", async (c) => {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  return c.json({ keys: keys.map(publicKey) });
});

// --- detail ---
adminRouter.get("/keys/:id", async (c) => {
  const k = await prisma.apiKey.findUnique({ where: { id: c.req.param("id") } });
  if (!k) return c.json({ error: "not found" }, 404);
  return c.json(publicKey(k));
});

// --- update (deactivate/activate, extend, edit limits/scope) ---
const updateSchema = z
  .object({
    label: z.string().min(1).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    scopes: scopeSchema.optional(),
    rateLimitPerMin: z.number().int().positive().optional(),
    quotaTotal: z.number().int().positive().nullable().optional(),
    resetQuota: z.boolean().optional(),
    extendDays: z.number().int().positive().optional(), // push expiry out
    expiresAt: z.string().datetime().nullable().optional(), // set/clear absolute
  })
  .refine((o) => Object.keys(o).length > 0, { message: "no fields to update" });

adminRouter.patch("/keys/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "not found" }, 404);

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  }
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.label !== undefined) data.label = d.label;
  if (d.status !== undefined) data.status = d.status;
  if (d.scopes !== undefined) data.scopes = d.scopes;
  if (d.rateLimitPerMin !== undefined) data.rateLimitPerMin = d.rateLimitPerMin;
  if (d.quotaTotal !== undefined) data.quotaTotal = d.quotaTotal;
  if (d.resetQuota) data.quotaUsed = 0;
  if (d.expiresAt !== undefined) {
    data.expiresAt = d.expiresAt === null ? null : new Date(d.expiresAt);
  }
  if (d.extendDays !== undefined) {
    const base =
      existing.expiresAt && existing.expiresAt.getTime() > Date.now()
        ? existing.expiresAt.getTime()
        : Date.now();
    data.expiresAt = new Date(base + d.extendDays * DAY_MS);
  }

  const updated = await prisma.apiKey.update({ where: { id }, data });
  await audit(c.get("actor") ?? "unknown", "key.update", id, d);
  return c.json(publicKey(updated));
});

// --- delete ---
adminRouter.delete("/keys/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "not found" }, 404);
  await prisma.apiKey.delete({ where: { id } });
  await audit(c.get("actor") ?? "unknown", "key.delete", id, {
    label: existing.label,
  });
  return c.json({ ok: true });
});

// --- usage dashboard aggregates ---
adminRouter.get("/usage", async (c) => {
  const [totalKeys, activeKeys, totalRequests, requests24h, perKey, keys] =
    await Promise.all([
      prisma.apiKey.count(),
      prisma.apiKey.count({ where: { status: "ACTIVE" } }),
      prisma.usageEvent.count(),
      prisma.usageEvent.count({
        where: { ts: { gte: new Date(Date.now() - DAY_MS) } },
      }),
      prisma.usageEvent.groupBy({
        by: ["apiKeyId"],
        _count: { _all: true },
        _max: { ts: true },
      }),
      prisma.apiKey.findMany({
        select: { id: true, label: true, keyPrefix: true, quotaUsed: true, quotaTotal: true },
      }),
    ]);

  const keyMap = new Map(keys.map((k) => [k.id, k]));
  const byKey = perKey.map((p) => {
    const k = p.apiKeyId ? keyMap.get(p.apiKeyId) : undefined;
    return {
      apiKeyId: p.apiKeyId,
      label: k?.label ?? "(deleted)",
      keyPrefix: k?.keyPrefix ?? "",
      requests: p._count._all,
      lastUsedAt: p._max.ts,
      quotaUsed: k?.quotaUsed ?? null,
      quotaTotal: k?.quotaTotal ?? null,
    };
  });

  return c.json({ totalKeys, activeKeys, totalRequests, requests24h, byKey });
});

// --- request logs (paged, newest first) ---
adminRouter.get("/logs", async (c) => {
  const { limit, cursor } = pageParams(c);
  const rows = await prisma.usageEvent.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { ts: "desc" },
    include: { apiKey: { select: { label: true, keyPrefix: true } } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return c.json({
    events: page.map((e) => ({
      id: e.id,
      ts: e.ts,
      endpoint: e.endpoint,
      questionTypes: e.questionTypes,
      inputTokens: e.inputTokens,
      latencyMs: e.latencyMs,
      statusCode: e.statusCode,
      keyLabel: e.apiKey?.label ?? e.keyLabel,
      keyPrefix: e.apiKey?.keyPrefix ?? null,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});

// --- audit log (paged, newest first) ---
adminRouter.get("/audit", async (c) => {
  const { limit, cursor } = pageParams(c);
  const rows = await prisma.auditEvent.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { ts: "desc" },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return c.json({
    events: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});
