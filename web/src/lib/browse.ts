/**
 * Pure, client-usable filter/sort logic for the Archive browser.
 *
 * The archive is served as static JSON shards under /public/data/browse/:
 *   - index.json     — BrowseManifest (shard listing + subreddit counts)
 *   - default.json   — the 200 worst-scored items (fast path for the default view)
 *   - <sub>-<year>.json — per-subreddit-per-year shards; subs outside
 *     manifest.top_subreddits are pooled into other-<year>.json shards.
 */

import type { BrowseItem, BrowseManifest } from "@/lib/types";

// ── types ────────────────────────────────────────────────────────

export type BrowseSort = "score_asc" | "score_desc" | "new" | "old";
export type BrowseItemType = "comment" | "submission";

export interface BrowseFilters {
  sub?: string;
  year?: number;
  type?: BrowseItemType;
  sort: BrowseSort;
  q?: string;
}

// ── constants ────────────────────────────────────────────────────

/** Default sort: "Most Downvoted" — that is why anyone is here. */
export const DEFAULT_SORT: BrowseSort = "score_asc";

/** Recorded activity spans these UTC years. */
export const BROWSE_YEARS: readonly number[] = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

/** The shard bucket that pools every subreddit outside top_subreddits. */
export const OTHER_BUCKET = "other";

export const SORT_OPTIONS: readonly { value: BrowseSort; label: string }[] = [
  { value: "score_asc", label: "Most Downvoted" },
  { value: "score_desc", label: "Most Upvoted" },
  { value: "new", label: "Newest" },
  { value: "old", label: "Oldest" },
];

const SORT_VALUES: readonly string[] = SORT_OPTIONS.map((option) => option.value);

// ── guards ───────────────────────────────────────────────────────

export function isBrowseSort(value: string): value is BrowseSort {
  return SORT_VALUES.includes(value);
}

export function isBrowseItemType(value: string): value is BrowseItemType {
  return value === "comment" || value === "submission";
}

/** Coerce an arbitrary string (e.g. a <select> value) to a valid sort. */
export function parseSort(value: string): BrowseSort {
  return isBrowseSort(value) ? value : DEFAULT_SORT;
}

// ── URL round-tripping ───────────────────────────────────────────

/** Read filters from a query string; invalid values fall back to defaults. */
export function parseFilters(searchParams: URLSearchParams): BrowseFilters {
  const sub = searchParams.get("sub")?.trim() ?? "";
  const yearRaw = searchParams.get("year") ?? "";
  const year = /^\d{4}$/.test(yearRaw) ? Number.parseInt(yearRaw, 10) : Number.NaN;
  const type = searchParams.get("type") ?? "";
  const sort = searchParams.get("sort") ?? "";
  const q = searchParams.get("q")?.trim() ?? "";

  return {
    ...(sub ? { sub } : {}),
    ...(BROWSE_YEARS.includes(year) ? { year } : {}),
    ...(isBrowseItemType(type) ? { type } : {}),
    sort: parseSort(sort),
    ...(q ? { q } : {}),
  };
}

/** Serialize filters to a query string; defaults are omitted for clean URLs. */
export function filtersToSearchParams(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.sub) params.set("sub", filters.sub);
  if (filters.year !== undefined) params.set("year", String(filters.year));
  if (filters.type) params.set("type", filters.type);
  if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  if (filters.q) params.set("q", filters.q);
  return params;
}

/** True when the view matches the precomputed default.json (fast path). */
export function isDefaultView(filters: BrowseFilters): boolean {
  return (
    filters.sub === undefined &&
    filters.year === undefined &&
    filters.type === undefined &&
    filters.q === undefined &&
    filters.sort === DEFAULT_SORT
  );
}

// ── shard selection ──────────────────────────────────────────────

/**
 * Shard files needed to satisfy the sub/year filters.
 *
 * A selected sub that is not in manifest.top_subreddits lives inside the
 * "other" bucket shards — those still need client-side subreddit filtering
 * after load (applyFilters handles that via exact subreddit match).
 */
export function shardsFor(manifest: BrowseManifest, filters: BrowseFilters): string[] {
  const shardSub =
    filters.sub === undefined
      ? undefined
      : manifest.top_subreddits.includes(filters.sub)
        ? filters.sub
        : OTHER_BUCKET;

  return manifest.shards
    .filter((shard) => shardSub === undefined || shard.subreddit === shardSub)
    .filter((shard) => filters.year === undefined || shard.year === filters.year)
    .map((shard) => shard.file);
}

// ── filtering + sorting ──────────────────────────────────────────

function matchesFilters(item: BrowseItem, filters: BrowseFilters, q: string | undefined): boolean {
  if (filters.type !== undefined && item.type !== filters.type) return false;
  if (filters.sub !== undefined && item.subreddit !== filters.sub) return false;
  if (
    filters.year !== undefined &&
    new Date(item.created_utc * 1000).getUTCFullYear() !== filters.year
  ) {
    return false;
  }
  if (q !== undefined) {
    const haystack = `${item.title ?? ""}\n${item.body ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/** Items with unknown (null) scores sort after everything, both directions. */
function compareByScore(a: BrowseItem, b: BrowseItem, direction: 1 | -1): number {
  if (a.score === null && b.score === null) return a.created_utc - b.created_utc;
  if (a.score === null) return 1;
  if (b.score === null) return -1;
  const byScore = (a.score - b.score) * direction;
  return byScore !== 0 ? byScore : a.created_utc - b.created_utc;
}

/** Return a new sorted array; never mutates the input. */
export function sortItems(items: readonly BrowseItem[], sort: BrowseSort): BrowseItem[] {
  const copy = [...items];
  switch (sort) {
    case "score_asc":
      return copy.sort((a, b) => compareByScore(a, b, 1));
    case "score_desc":
      return copy.sort((a, b) => compareByScore(a, b, -1));
    case "new":
      return copy.sort((a, b) => b.created_utc - a.created_utc);
    case "old":
      return copy.sort((a, b) => a.created_utc - b.created_utc);
  }
}

/**
 * Filter (type, UTC year, exact subreddit, lowercase substring over
 * title+body) then sort. Returns a new array.
 */
export function applyFilters(
  items: readonly BrowseItem[],
  filters: BrowseFilters,
): BrowseItem[] {
  const q = filters.q?.toLowerCase();
  const matched = items.filter((item) => matchesFilters(item, filters, q));
  return sortItems(matched, filters.sort);
}
