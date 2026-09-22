import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { laya } from "./laya.js";
import { disconnectDb } from "./db.js";

const app = new Hono();

app.use("*", logger());

// Liveness: the process is up. Used by the deploy workflow's health gate.
app.get("/health", (c) => c.json({ ok: true }));

// Readiness/introspection: model load state, uptime, memory. Feeds the portal.
app.get("/status", (c) => c.json(laya.getStatus()));

// --- API routers mount here in the next increment ---
// app.route("/v1", inferenceRouter);   // caller API key
// app.route("/admin", adminRouter);    // master secret / portal session
// app.route("/auth", authRouter);      // portal login

// Static SPA (built to web/dist) with client-side routing fallback.
// The portal isn't built yet in early increments, so fall back to a small
// landing page when web/dist/index.html is absent.
const spaDir = "./web/dist";
if (existsSync(`${spaDir}/index.html`)) {
  app.use("/*", serveStatic({ root: spaDir }));
  app.get("*", serveStatic({ path: `${spaDir}/index.html` }));
} else {
  app.get("*", (c) =>
    c.html(
      `<!doctype html><meta charset="utf-8"><title>Laya</title>` +
        `<style>body{font:16px system-ui;margin:3rem;max-width:40rem}</style>` +
        `<h1>Laya service</h1>` +
        `<p>The API is live. The management portal is still being built.</p>` +
        `<p>See <a href="/status">/status</a> and <a href="/health">/health</a>.</p>`,
    ),
  );
}

const server = serve(
  { fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" },
  (info) => {
    console.log(`laya-service listening on 0.0.0.0:${info.port}`);
  },
);

// Load the model in the background so the server is immediately live for
// /health; /status reports progress until the model is ready.
void laya.init();

async function shutdown(signal: string) {
  console.log(`received ${signal}, shutting down`);
  server.close();
  await laya.close().catch(() => {});
  await disconnectDb().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
