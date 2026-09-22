// Per-key fixed-window rate limiting, in memory. Fine for a single app
// instance; the window resets every 60s. Quota (the long-term budget) is
// tracked in Postgres instead — this is only the short burst guard.

interface Window {
  count: number;
  windowStart: number;
}

const windows = new Map<string, Window>();

export function checkRateLimit(
  keyId: string,
  perMin: number,
): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const w = windows.get(keyId);
  if (!w || now - w.windowStart >= 60_000) {
    windows.set(keyId, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (w.count >= perMin) {
    return { ok: false, retryAfter: Math.ceil((w.windowStart + 60_000 - now) / 1000) };
  }
  w.count += 1;
  return { ok: true };
}
