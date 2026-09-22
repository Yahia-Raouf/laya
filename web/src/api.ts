export type ModelStatus = {
  model: "loading" | "ready" | "error" | "disabled";
  error: string | null;
  uptimeSec: number;
  rssMB: number;
};
export type Session = { authenticated: boolean; username?: string };

export type ApiKey = {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  status: "ACTIVE" | "INACTIVE";
  effectiveStatus: "ACTIVE" | "INACTIVE" | "EXPIRED";
  createdAt: string;
  expiresAt: string | null;
  rateLimitPerMin: number;
  quotaTotal: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  lastUsedAt: string | null;
};
export type CreatedKey = ApiKey & { key: string };

export type UsageSummary = {
  totalKeys: number;
  activeKeys: number;
  totalRequests: number;
  requests24h: number;
  byKey: {
    apiKeyId: string | null;
    label: string;
    keyPrefix: string;
    requests: number;
    lastUsedAt: string | null;
    quotaUsed: number | null;
    quotaTotal: number | null;
  }[];
};

export type LogEvent = {
  id: string;
  ts: string;
  endpoint: string;
  questionTypes: string[];
  inputTokens: number | null;
  latencyMs: number | null;
  statusCode: number;
  keyLabel: string | null;
  keyPrefix: string | null;
};

export type AuditEvent = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  targetKeyId: string | null;
  detail: unknown;
};

export type Answer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: "score";
      score: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
      confidence: number;
    }
  | { type: "noul"; noul: number };

export type InferenceResult = {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type CreateKeyInput = {
  label: string;
  scopes?: string[];
  expiresInDays?: number | null;
  rateLimitPerMin?: number;
  quotaTotal?: number | null;
};

export type PatchKeyInput = {
  label?: string;
  status?: "ACTIVE" | "INACTIVE";
  scopes?: string[];
  rateLimitPerMin?: number;
  quotaTotal?: number | null;
  resetQuota?: boolean;
  extendDays?: number;
  expiresAt?: string | null;
};

export const api = {
  status: () => req<ModelStatus>("/status"),
  session: () => req<Session>("/auth/session"),
  login: (username: string, password: string) =>
    req<{ ok: boolean; username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  listKeys: () => req<{ keys: ApiKey[] }>("/admin/keys"),
  createKey: (body: CreateKeyInput) =>
    req<CreatedKey>("/admin/keys", { method: "POST", body: JSON.stringify(body) }),
  patchKey: (id: string, body: PatchKeyInput) =>
    req<ApiKey>(`/admin/keys/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteKey: (id: string) =>
    req<{ ok: boolean }>(`/admin/keys/${id}`, { method: "DELETE" }),

  // playground: run via the admin session, or via a pasted API key (real /v1 path)
  inferenceAdmin: (body: unknown) =>
    req<InferenceResult>("/admin/inference", { method: "POST", body: JSON.stringify(body) }),
  inferenceKey: (body: unknown, key: string) =>
    req<InferenceResult>("/v1/inference", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    }),

  usage: () => req<UsageSummary>("/admin/usage"),
  logs: (cursor?: string) =>
    req<{ events: LogEvent[]; nextCursor: string | null }>(
      `/admin/logs${cursor ? `?cursor=${cursor}` : ""}`,
    ),
  audit: (cursor?: string) =>
    req<{ events: AuditEvent[]; nextCursor: string | null }>(
      `/admin/audit${cursor ? `?cursor=${cursor}` : ""}`,
    ),
};
