import { Laya } from "@receptron/laya";
import { env } from "./env.js";

// Laya is expensive to load (~1.7 GB weights, ~2 GB RAM) and slow on this CPU,
// so we load exactly one instance for the whole process and reuse it.

type ModelState = "loading" | "ready" | "error";

let state: ModelState = "loading";
let lastError: string | null = null;
let instance: Awaited<ReturnType<typeof Laya.load>> | null = null;
const startedAt = Date.now();

async function init(): Promise<void> {
  try {
    state = "loading";
    lastError = null;
    instance = await Laya.load({
      executionProviders: ["cpu"],
      ...(env.LAYA_CACHE ? { cacheDir: env.LAYA_CACHE } : {}),
    });
    state = "ready";
    console.log("laya model ready");
  } catch (err) {
    state = "error";
    lastError = err instanceof Error ? err.message : String(err);
    console.error("laya model failed to load:", lastError);
  }
}

function getStatus() {
  const mem = process.memoryUsage();
  return {
    model: state,
    error: lastError,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    rssMB: Math.round(mem.rss / 1024 / 1024),
  };
}

function isReady(): boolean {
  return state === "ready" && instance !== null;
}

// Thin passthrough; callers pass Laya's `state` object and `questions` map.
async function systemOne(
  inputState: unknown,
  questions: unknown,
): Promise<Awaited<ReturnType<NonNullable<typeof instance>["systemOne"]>>> {
  if (!instance) {
    throw new Error(`laya model not ready (state=${state})`);
  }
  // Types are loose here on purpose; request validation happens at the route.
  return instance.systemOne(inputState as never, questions as never);
}

async function close(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}

export const laya = { init, getStatus, isReady, systemOne, close };
