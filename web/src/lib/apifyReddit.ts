/**
 * Live /r/Chipotle feed via the Apify Reddit scraper.
 *
 * Reddit blocks its public `.json` endpoints from datacenter IPs and closed
 * self-serve API access in Nov 2025, so the direct paths in `reddit.ts` can't
 * reach Reddit from Vercel. This module runs the `fatihtahta/reddit-scraper-
 * search-fast` Actor (which uses Apify's residential proxies) via the
 * synchronous `run-sync-get-dataset-items` REST endpoint and normalizes the
 * result into `FeedPost`s.
 *
 * Enabled when `APIFY_TOKEN` is set. Results are cached in KV so the Actor
 * runs at most once per window regardless of traffic, with a longer-lived
 * snapshot for stale-on-error. Server-only — do not import from client code.
 */

import { kv } from "./kv";
import type { FeedPost, FeedResponse, FeedSort } from "./types";

const ACTOR = "fatihtahta~reddit-scraper-search-fast";
const RUN_SYNC_URL = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;
const LIMIT = 25;
const SELFTEXT_MAX_CHARS = 1200;
const GALLERY_MAX_IMAGES = 4;
const PREVIEW_TARGET_INDEX = 3; // reddit preview widths [108,216,320,640,…] → ~640w
const FRESH_TTL_SECONDS = 180; // serve a cached page for 3 min before re-running
const SNAPSHOT_TTL_SECONDS = 86_400; // last-good copy for stale-on-error
const RUN_TIMEOUT_MS = 45_000;

export interface ApifyFetchOptions {
  t?: "day" | "week";
}

type FeedImage = { url: string; width: number; height: number };

// ── raw Actor output (only the fields we consume) ───────────────

interface RawGalleryImage {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  previews?: unknown;
}

interface RawApifyPost {
  id?: unknown;
  title?: unknown;
  body?: unknown;
  author?: unknown;
  score?: unknown;
  num_comments?: unknown;
  created_utc?: unknown; // ISO 8601 string
  permalink?: unknown; // relative, e.g. "/r/Chipotle/comments/…"
  flair?: unknown;
  thumbnail?: unknown;
  over_18?: unknown;
  is_video?: unknown;
  is_gallery?: unknown;
  stickied?: unknown;
  is_deleted_or_removed?: unknown;
  gallery_images?: RawGalleryImage[];
}

// ── narrowing helpers ───────────────────────────────────────────

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ── normalization ───────────────────────────────────────────────

function bestPreview(previews: unknown, fallbackUrl: string): FeedImage | null {
  if (Array.isArray(previews) && previews.length > 0) {
    const url = asString(previews[Math.min(PREVIEW_TARGET_INDEX, previews.length - 1)]);
    if (url !== null && url.length > 0) return { url, width: 640, height: 0 };
  }
  return fallbackUrl.length > 0 ? { url: fallbackUrl, width: 0, height: 0 } : null;
}

function normalizeGallery(images: RawGalleryImage[] | undefined): FeedImage[] | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const out = images
    .slice(0, GALLERY_MAX_IMAGES)
    .map((img) => bestPreview(img.previews, asString(img.url) ?? ""))
    .filter((img): img is FeedImage => img !== null);
  return out.length > 0 ? out : null;
}

function toEpochSeconds(value: unknown): number {
  const iso = asString(value);
  if (iso !== null) {
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  return asNumber(value) ?? 0;
}

function normalizePost(raw: RawApifyPost): FeedPost | null {
  const id = asString(raw.id);
  const title = asString(raw.title);
  const permalink = asString(raw.permalink);
  if (id === null || title === null || permalink === null) return null;
  if (raw.over_18 === true || raw.stickied === true || raw.is_deleted_or_removed === true) {
    return null;
  }

  const gallery = normalizeGallery(raw.gallery_images);
  const thumbnail = asString(raw.thumbnail);
  const validThumb = thumbnail !== null && thumbnail.startsWith("http") ? thumbnail : null;
  // preview and gallery are mutually exclusive so cards don't double-render.
  const preview = gallery !== null ? null : validThumb ? { url: validThumb, width: 0, height: 0 } : null;
  const flair = asString(raw.flair);

  return {
    id,
    fullname: `t3_${id}`,
    title,
    selftext: (asString(raw.body) ?? "").slice(0, SELFTEXT_MAX_CHARS),
    author: asString(raw.author) ?? "[deleted]",
    score: asNumber(raw.score) ?? 0,
    numComments: asNumber(raw.num_comments) ?? 0,
    createdUtc: toEpochSeconds(raw.created_utc),
    permalink: permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`,
    flair: flair !== null && flair.length > 0 ? flair : null,
    thumbnail: validThumb,
    preview,
    gallery,
    isVideo: raw.is_video === true,
  };
}

// ── Actor run ───────────────────────────────────────────────────

function actorInput(sort: FeedSort, opts?: ApifyFetchOptions): Record<string, unknown> {
  return {
    subredditName: "Chipotle",
    subredditSort: sort, // "hot" | "new" | "top" are all valid Actor enum values
    subredditTimeframe: sort === "top" ? (opts?.t ?? "day") : "all",
    maxPosts: LIMIT,
    scrapeComments: false,
    includeNsfw: false,
  };
}

async function runActor(sort: FeedSort, opts: ApifyFetchOptions | undefined, token: string): Promise<FeedPost[]> {
  const url = `${RUN_SYNC_URL}?token=${encodeURIComponent(token)}&maxItems=${LIMIT}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(actorInput(sort, opts)),
    signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`apify run failed: ${res.status} ${res.statusText}`);
  }
  const items = (await res.json()) as RawApifyPost[];
  if (!Array.isArray(items)) {
    throw new Error("apify run returned a non-array payload");
  }
  return items.map((raw) => normalizePost(raw)).filter((post): post is FeedPost => post !== null);
}

/**
 * Cached, non-throwing-on-stale entry point. Returns the KV-cached page when
 * fresh; otherwise runs the Actor, caches it, and stores a snapshot. On failure
 * it serves the last-good snapshot (marked stale) rather than throwing.
 */
export async function fetchListingViaApify(sort: FeedSort, opts?: ApifyFetchOptions): Promise<FeedResponse> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");

  const base = `feed:apify:${sort}:${sort === "top" ? (opts?.t ?? "day") : "all"}`;
  const snapshotKey = `${base}:snapshot`;

  const fresh = await kv.get<FeedResponse>(base);
  if (fresh) return fresh;

  try {
    const posts = await runActor(sort, opts, token);
    const payload: FeedResponse = { posts, after: null, sort, fetchedAt: Date.now(), stale: false };
    await kv.set(base, payload, FRESH_TTL_SECONDS);
    await kv.set(snapshotKey, payload, SNAPSHOT_TTL_SECONDS);
    return payload;
  } catch (error: unknown) {
    const snapshot = await kv.get<FeedResponse>(snapshotKey);
    if (snapshot) return { ...snapshot, stale: true };
    throw error;
  }
}
