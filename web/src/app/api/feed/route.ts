/**
 * GET /api/feed — proxies the live /r/Chipotle listing for the client feed.
 *
 * Query params (all validated against whitelists, silently defaulted):
 *   sort  hot | new | top          (default hot)
 *   t     day | week               (default day, only meaningful for top)
 *   after t3_xxxx pagination cursor (ignored unless it matches the pattern)
 */

import { fetchListing } from "@/lib/reddit";
import type { FeedSort } from "@/lib/types";

// The Apify scraper runs synchronously and can take several seconds; allow headroom.
export const maxDuration = 60;

const AFTER_PATTERN = /^t3_[a-z0-9]+$/;

function parseSort(value: string | null): FeedSort {
  return value === "new" || value === "top" ? value : "hot";
}

function parseWindow(value: string | null): "day" | "week" {
  return value === "week" ? "week" : "day";
}

function parseAfter(value: string | null): string | null {
  return value !== null && AFTER_PATTERN.test(value) ? value : null;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const sort = parseSort(searchParams.get("sort"));
  const t = parseWindow(searchParams.get("t"));
  const after = parseAfter(searchParams.get("after"));

  try {
    const feed = await fetchListing(sort, { t, after });
    return Response.json(feed, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error: unknown) {
    console.error("[api/feed] listing fetch failed", error);
    return Response.json({ error: "reddit_unavailable" }, { status: 502 });
  }
}
