import { Hono } from "hono";
import { prisma } from "../db.js";
import { laya } from "../laya.js";
import { requireApiKey } from "../auth/middleware.js";
import { checkRateLimit } from "../ratelimit.js";
import { inferSchema } from "../validation.js";
import type { AppEnv } from "../types.js";

export const inferenceRouter = new Hono<AppEnv>();
inferenceRouter.use("*", requireApiKey);

inferenceRouter.post("/inference", async (c) => {
  const apiKey = c.get("apiKey")!;

  // Validate the request fully (400/403/429) before worrying about the model,
  // so a malformed or out-of-scope call fails cleanly even while it's loading.
  const parsed = inferSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  }
  const { state, questions } = parsed.data;
  if (Object.keys(questions).length === 0) {
    return c.json({ error: "at least one question is required" }, 400);
  }

  const types = [...new Set(Object.values(questions).map((q) => q.type))];
  const disallowed = types.filter((t) => !apiKey.scopes.includes(t));
  if (disallowed.length) {
    return c.json({ error: `scope not allowed for: ${disallowed.join(", ")}` }, 403);
  }

  const rl = checkRateLimit(apiKey.id, apiKey.rateLimitPerMin);
  if (!rl.ok) {
    c.header("Retry-After", String(rl.retryAfter ?? 60));
    return c.json({ error: "rate limit exceeded" }, 429);
  }

  if (!laya.isReady()) {
    return c.json({ error: "model not ready", status: laya.getStatus() }, 503);
  }

  const started = Date.now();
  try {
    const result = await laya.systemOne(state, questions);
    const inputTokens =
      (result as { usage?: { input_tokens?: number } })?.usage?.input_tokens ?? null;

    await prisma.$transaction([
      prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { quotaUsed: { increment: 1 }, lastUsedAt: new Date() },
      }),
      prisma.usageEvent.create({
        data: {
          apiKeyId: apiKey.id,
          keyLabel: apiKey.label,
          endpoint: "/v1/inference",
          questionTypes: types,
          inputTokens,
          latencyMs: Date.now() - started,
          statusCode: 200,
        },
      }),
    ]);

    return c.json(result);
  } catch (err) {
    await prisma.usageEvent
      .create({
        data: {
          apiKeyId: apiKey.id,
          keyLabel: apiKey.label,
          endpoint: "/v1/inference",
          questionTypes: types,
          latencyMs: Date.now() - started,
          statusCode: 500,
        },
      })
      .catch(() => {});
    return c.json(
      { error: "inference failed", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

// Metadata about the calling key.
inferenceRouter.get("/me", (c) => {
  const k = c.get("apiKey")!;
  const expired = !!(k.expiresAt && k.expiresAt.getTime() < Date.now());
  return c.json({
    label: k.label,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    status: k.status,
    expired,
    expiresAt: k.expiresAt,
    rateLimitPerMin: k.rateLimitPerMin,
    quotaTotal: k.quotaTotal,
    quotaUsed: k.quotaUsed,
    quotaRemaining: k.quotaTotal === null ? null : Math.max(0, k.quotaTotal - k.quotaUsed),
  });
});
