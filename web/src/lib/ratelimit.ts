/**
 * Rate limiting for /api/reply.
 *
 * With Upstash env configured: sliding window of 8 generations per 5 minutes
 * per IP via @upstash/ratelimit (regenerate counts double via the `rate`
 * option). Without it: an in-memory fixed window so local dev needs no
 * services. A daily generation budget rides on top via the shared KV counter.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { kv } from "./kv";

const WINDOW_LIMIT = 8;
const WINDOW_SECONDS = 5 * 60;
const DEFAULT_DAILY_CAP = 500;
const USAGE_TTL_SECONDS = 48 * 3600;

export interface ReplyLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
}

// ── Upstash sliding window ──────────────────────────────────────

function createUpstashLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(WINDOW_LIMIT, "5 m"),
    prefix: "rl:reply",
  });
}

const upstashLimiter: Ratelimit | null = createUpstashLimiter();

// ── In-memory fixed window fallback ─────────────────────────────

interface WindowEntry {
  readonly count: number;
  readonly resetAt: number; // epoch ms
}

const globalScope = globalThis as typeof globalThis & {
  __pepperRateWindows?: Map<string, WindowEntry>;
};

function windowStore(): Map<string, WindowEntry> {
  globalScope.__pepperRateWindows ??= new Map<string, WindowEntry>();
  return globalScope.__pepperRateWindows;
}

function checkMemoryLimit(ip: string, weight: number): ReplyLimitResult {
  const store = windowStore();
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || entry.resetAt <= now) {
    store.set(ip, { count: weight, resetAt: now + WINDOW_SECONDS * 1000 });
    return weight <= WINDOW_LIMIT ? { ok: true } : { ok: false, retryAfterSeconds: WINDOW_SECONDS };
  }

  const next = entry.count + weight;
  if (next > WINDOW_LIMIT) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  store.set(ip, { count: next, resetAt: entry.resetAt });
  return { ok: true };
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Check the per-IP generation limit. `weight` is how many window tokens the
 * request consumes (1 for a fresh reply, 2 for a regenerate).
 */
export async function checkReplyLimit(ip: string, weight: number): Promise<ReplyLimitResult> {
  if (!upstashLimiter) return checkMemoryLimit(ip, weight);
  try {
    const result = await upstashLimiter.limit(ip, { rate: weight });
    if (result.success) return { ok: true };
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  } catch {
    // Rate-limit backend unreachable — degrade to the local window rather
    // than blocking every request or letting traffic through unmetered.
    return checkMemoryLimit(ip, weight);
  }
}

/**
 * Global daily budget across all users: increments today's UTC usage counter
 * and returns whether the request is within `DAILY_GENERATION_CAP` (500 by
 * default). Fails open if the counter backend is unreachable.
 */
export async function checkDailyBudget(): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
  const capRaw = Number(process.env.DAILY_GENERATION_CAP ?? DEFAULT_DAILY_CAP);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : DEFAULT_DAILY_CAP;
  try {
    const used = await kv.incr(`usage:${day}`, USAGE_TTL_SECONDS);
    return used <= cap;
  } catch {
    return true;
  }
}
