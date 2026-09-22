import { createHash, randomBytes } from "node:crypto";

export const QUESTION_TYPES = ["choice", "score", "noul"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// Pre-filled at key creation unless the request overrides them.
export const KEY_DEFAULTS = {
  expiresInDays: 90 as number | null, // null = never expires
  rateLimitPerMin: 20,
  quotaTotal: 10000 as number | null, // null = unlimited
  scopes: [...QUESTION_TYPES] as string[],
};

export interface GeneratedKey {
  key: string; // the full secret, shown to the admin exactly once
  hash: string; // sha256(key), what we store
  prefix: string; // first chars, stored in clear for display/lookup
}

export function generateApiKey(): GeneratedKey {
  const key = `laya_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
