import type { ApiKey } from "@prisma/client";

// Values set on the Hono context by middleware.
export type Variables = {
  apiKey?: ApiKey; // set by requireApiKey on /v1 routes
  actor?: string; // set by requireAdmin: "secret" | "portal:<username>"
};

export type AppEnv = { Variables: Variables };
