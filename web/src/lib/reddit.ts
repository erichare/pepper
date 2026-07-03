/**
 * Server-only reddit listing client for /r/Chipotle.
 *
 * Fetches public listing JSON, normalizes it into `FeedPost`s, and leans on
 * the Next Data Cache (`next.revalidate`) so background revalidation errors
 * keep serving the last good payload. Do not import from client components.
 */

import type { FeedPost, FeedResponse, FeedSort } from "@/lib/types";

const BASE_URL = "https://www.reddit.com/r/Chipotle";
const DEFAULT_USER_AGENT = "web:pepper-dossier:v1.0.0 (by /u/newppinpoint)";
const REVALIDATE_SECONDS = 120;
const LISTING_LIMIT = 25;
const SELFTEXT_MAX_CHARS = 1200;
const TARGET_IMAGE_WIDTH = 640;
const GALLERY_MAX_IMAGES = 4;

export interface FetchListingOptions {
  t?: "day" | "week";
  after?: string | null;
}

// ── minimal raw reddit listing types ────────────────────────────

interface RawImageCandidate {
  url?: unknown;
  width?: unknown;
  height?: unknown;
}

interface RawPreviewImage {
  source?: RawImageCandidate;
  resolutions?: RawImageCandidate[];
}

/** media_metadata entries use `u`/`x`/`y` instead of url/width/height. */
interface RawMediaCandidate {
  u?: unknown;
  x?: unknown;
  y?: unknown;
}

interface RawMediaMetadataEntry {
  p?: RawMediaCandidate[];
  s?: RawMediaCandidate;
}

interface RawGalleryItem {
  media_id?: unknown;
}

interface RawPost {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  selftext?: unknown;
  author?: unknown;
  score?: unknown;
  num_comments?: unknown;
  created_utc?: unknown;
  permalink?: unknown;
  link_flair_text?: unknown;
  thumbnail?: unknown;
  over_18?: unknown;
  stickied?: unknown;
  is_video?: unknown;
  is_gallery?: unknown;
  gallery_data?: { items?: RawGalleryItem[] } | null;
  media_metadata?: Record<string, RawMediaMetadataEntry | undefined> | null;
  preview?: { images?: RawPreviewImage[] } | null;
}

interface RawListing {
  data?: {
    after?: string | null;
    children?: { kind?: unknown; data?: RawPost }[];
  };
}

// ── narrowing helpers ───────────────────────────────────────────

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type FeedImage = { url: string; width: number; height: number };

function toFeedImage(candidate: RawImageCandidate | undefined): FeedImage | null {
  const url = asString(candidate?.url);
  if (url === null || url.length === 0) return null;
  return {
    url,
    width: asNumber(candidate?.width) ?? 0,
    height: asNumber(candidate?.height) ?? 0,
  };
}

function toFeedImageFromMedia(candidate: RawMediaCandidate | undefined): FeedImage | null {
  const url = asString(candidate?.u);
  if (url === null || url.length === 0) return null;
  return {
    url,
    width: asNumber(candidate?.x) ?? 0,
    height: asNumber(candidate?.y) ?? 0,
  };
}

/** Best-fit candidate: the one whose width is closest to TARGET_IMAGE_WIDTH. */
function pickNearTargetWidth(candidates: readonly (FeedImage | null)[]): FeedImage | null {
  return candidates.reduce<FeedImage | null>((best, candidate) => {
    if (candidate === null) return best;
    if (best === null) return candidate;
    const bestDelta = Math.abs(best.width - TARGET_IMAGE_WIDTH);
    const delta = Math.abs(candidate.width - TARGET_IMAGE_WIDTH);
    return delta < bestDelta ? candidate : best;
  }, null);
}

// ── normalization ───────────────────────────────────────────────

function normalizePreview(preview: RawPost["preview"]): FeedImage | null {
  const image = preview?.images?.[0];
  if (!image) return null;
  const fromResolutions = pickNearTargetWidth(
    (image.resolutions ?? []).map((candidate) => toFeedImage(candidate)),
  );
  return fromResolutions ?? toFeedImage(image.source);
}

function normalizeGallery(raw: RawPost): FeedImage[] | null {
  if (raw.is_gallery !== true) return null;
  const items = raw.gallery_data?.items ?? [];
  const metadata = raw.media_metadata ?? {};
  const images = items
    .map((item) => {
      const mediaId = asString(item.media_id);
      const entry = mediaId !== null ? metadata[mediaId] : undefined;
      if (!entry) return null;
      const fromPreviews = pickNearTargetWidth(
        (entry.p ?? []).map((candidate) => toFeedImageFromMedia(candidate)),
      );
      return fromPreviews ?? toFeedImageFromMedia(entry.s);
    })
    .filter((image): image is FeedImage => image !== null)
    .slice(0, GALLERY_MAX_IMAGES);
  return images.length > 0 ? images : null;
}

function normalizePost(raw: RawPost): FeedPost | null {
  const id = asString(raw.id);
  const fullname = asString(raw.name);
  const title = asString(raw.title);
  const permalink = asString(raw.permalink);
  if (id === null || fullname === null || title === null || permalink === null) return null;

  const thumbnail = asString(raw.thumbnail);
  const flair = asString(raw.link_flair_text);

  return {
    id,
    fullname,
    title,
    selftext: (asString(raw.selftext) ?? "").slice(0, SELFTEXT_MAX_CHARS),
    author: asString(raw.author) ?? "[deleted]",
    score: asNumber(raw.score) ?? 0,
    numComments: asNumber(raw.num_comments) ?? 0,
    createdUtc: asNumber(raw.created_utc) ?? 0,
    permalink: `https://www.reddit.com${permalink}`,
    flair: flair !== null && flair.length > 0 ? flair : null,
    thumbnail: thumbnail !== null && thumbnail.startsWith("http") ? thumbnail : null,
    preview: normalizePreview(raw.preview),
    gallery: normalizeGallery(raw),
    isVideo: raw.is_video === true,
  };
}

// ── fetching ────────────────────────────────────────────────────

function buildListingUrl(sort: FeedSort, opts?: FetchListingOptions): string {
  const parts = [`${BASE_URL}/${sort}.json?limit=${LISTING_LIMIT}&raw_json=1`];
  if (sort === "top") parts.push(`&t=${opts?.t ?? "day"}`);
  if (opts?.after) parts.push(`&after=${encodeURIComponent(opts.after)}`);
  return parts.join("");
}

/**
 * Fetch and normalize one page of the /r/Chipotle listing.
 *
 * Throws on any non-2xx response — load-bearing: the Next Data Cache then
 * keeps serving the last-good payload on background revalidation errors,
 * whereas returning an error body would poison the cache for two minutes.
 */
export async function fetchListing(
  sort: FeedSort,
  opts?: FetchListingOptions,
): Promise<FeedResponse> {
  const res = await fetch(buildListingUrl(sort, opts), {
    headers: {
      "User-Agent": process.env.REDDIT_USER_AGENT ?? DEFAULT_USER_AGENT,
      Accept: "application/json",
    },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    throw new Error(`reddit listing request failed: ${res.status} ${res.statusText}`);
  }

  const listing = (await res.json()) as RawListing;
  const children = listing.data?.children ?? [];
  const posts = children
    .map((child) => child.data)
    .filter((raw): raw is RawPost => raw !== undefined)
    .filter((raw) => raw.over_18 !== true && raw.stickied !== true)
    .map((raw) => normalizePost(raw))
    .filter((post): post is FeedPost => post !== null);

  return { posts, after: listing.data?.after ?? null, sort, fetchedAt: Date.now(), stale: false };
}

/**
 * Non-throwing wrapper: on any failure returns an empty, `stale: true`
 * response so callers can render an error state without crashing.
 */
export async function safeFetchListing(
  sort: FeedSort,
  opts?: FetchListingOptions,
): Promise<FeedResponse> {
  try {
    return await fetchListing(sort, opts);
  } catch (error: unknown) {
    console.error("[feed] reddit listing fetch failed", error);
    return { posts: [], after: null, sort, fetchedAt: 0, stale: true };
  }
}
