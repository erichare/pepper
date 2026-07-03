/**
 * Thin KV abstraction for the reply cache and usage counters.
 *
 * When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are present the
 * store is Upstash Redis; otherwise it falls back to an in-memory Map with
 * TTL handling so local dev works with zero external services. The memory
 * store is stashed on `globalThis` so it survives Next.js dev-server module
 * reloads within one process.
 */

import { Redis } from "@upstash/redis";

export interface KvClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** Increment a counter. TTL is applied only when the key is created. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

// ── In-memory fallback ──────────────────────────────────────────

interface MemoryEntry {
  readonly value: unknown;
  readonly expiresAt: number; // epoch ms
}

const globalScope = globalThis as typeof globalThis & {
  __pepperKvStore?: Map<string, MemoryEntry>;
};

function memoryStore(): Map<string, MemoryEntry> {
  globalScope.__pepperKvStore ??= new Map<string, MemoryEntry>();
  return globalScope.__pepperKvStore;
}

function readLiveEntry(store: Map<string, MemoryEntry>, key: string): MemoryEntry | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry;
}

function createMemoryKv(): KvClient {
  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = readLiveEntry(memoryStore(), key);
      return entry ? (entry.value as T) : null;
    },

    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      memoryStore().set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },

    async incr(key: string, ttlSeconds: number): Promise<number> {
      const store = memoryStore();
      const entry = readLiveEntry(store, key);
      const current = typeof entry?.value === "number" ? entry.value : 0;
      const next = current + 1;
      const expiresAt = entry ? entry.expiresAt : Date.now() + ttlSeconds * 1000;
      store.set(key, { value: next, expiresAt });
      return next;
    },
  };
}

// ── Upstash Redis backend ───────────────────────────────────────

function createUpstashKv(url: string, token: string): KvClient {
  const redis = new Redis({ url, token });

  return {
    async get<T>(key: string): Promise<T | null> {
      return redis.get<T>(key);
    },

    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      await redis.set(key, value, { ex: ttlSeconds });
    },

    async incr(key: string, ttlSeconds: number): Promise<number> {
      const next = await redis.incr(key);
      // First increment created the key — attach the TTL exactly once.
      if (next === 1) {
        await redis.expire(key, ttlSeconds);
      }
      return next;
    },
  };
}

function createKv(): KvClient {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createUpstashKv(url, token);
  return createMemoryKv();
}

/** Module-level singleton: one client (or one in-memory store) per process. */
export const kv: KvClient = createKv();
