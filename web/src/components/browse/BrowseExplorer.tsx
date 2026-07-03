"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import type { BrowseItem, BrowseManifest } from "@/lib/types";
import {
  applyFilters,
  filtersToSearchParams,
  isDefaultView,
  parseFilters,
  parseSort,
  shardsFor,
  SORT_OPTIONS,
  type BrowseFilters,
} from "@/lib/browse";
import { formatNumber } from "@/lib/format";
import { FilterRail } from "./FilterRail";
import { ResultRow } from "./ResultRow";

const PAGE_SIZE = 50;
const DEFAULT_FILE = "default.json";
const BROWSE_BASE = "/data/browse";

interface BrowseExplorerProps {
  /** Plain string map of the initial URL search params (server-provided). */
  initialParams: Record<string, string>;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (${res.status})`);
  }
  return (await res.json()) as T;
}

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex animate-pulse gap-3 border-b border-kraft py-3">
          <div className="h-4 w-14 shrink-0 rounded bg-kraft/60" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-kraft/50" />
            <div className="h-4 w-3/4 rounded bg-kraft/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrowseExplorer({ initialParams }: BrowseExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const [filters, setFilters] = useState<BrowseFilters>(() =>
    parseFilters(new URLSearchParams(initialParams)),
  );
  const [manifest, setManifest] = useState<BrowseManifest | null>(null);
  const [loadedItems, setLoadedItems] = useState<readonly BrowseItem[] | null>(null);
  const [onFastPath, setOnFastPath] = useState(true);
  const [forceFull, setForceFull] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache of already-fetched shard files; a ref so re-renders never refetch.
  const shardCacheRef = useRef<Map<string, BrowseItem[]>>(new Map());
  const manifestRef = useRef<BrowseManifest | null>(null);
  const requestIdRef = useRef(0);

  const loadForFilters = useCallback(async (next: BrowseFilters, full: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      let m = manifestRef.current;
      if (m === null) {
        m = await fetchJson<BrowseManifest>(`${BROWSE_BASE}/index.json`);
        manifestRef.current = m;
        setManifest(m);
      }
      const fastPath = !full && isDefaultView(next);
      const files = fastPath ? [DEFAULT_FILE] : shardsFor(m, next);
      const shards = await Promise.all(
        files.map(async (file) => {
          const cached = shardCacheRef.current.get(file);
          if (cached !== undefined) return cached;
          const data = await fetchJson<unknown>(`${BROWSE_BASE}/${file}`);
          if (!Array.isArray(data)) {
            throw new Error(`Malformed shard: ${file}`);
          }
          const items = data as BrowseItem[];
          shardCacheRef.current.set(file, items);
          return items;
        }),
      );
      if (requestIdRef.current !== requestId) return; // stale response
      setLoadedItems(shards.flat());
      setOnFastPath(fastPath);
      setLoading(false);
    } catch (err: unknown) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "Failed to load the archive.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Canonical "load data when the query changes" effect: the shard fetch sets
    // loading/results state as it resolves. This is the intended use of an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadForFilters(filters, forceFull);
  }, [filters, forceFull, loadForFilters]);

  const handleFiltersChange = useCallback(
    (next: BrowseFilters) => {
      setFilters(next);
      setPage(1);
      setForceFull(false);
      const qs = filtersToSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const filtered = useMemo<BrowseItem[]>(() => {
    if (loadedItems === null) return [];
    // default.json is already worst-first with no filters active,
    // but re-applying is cheap and keeps one code path.
    return applyFilters(loadedItems, filters);
  }, [loadedItems, filters]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const archiveTotal = manifest?.total ?? 0;
  const totalForView = onFastPath ? archiveTotal : filtered.length;
  const exhaustedLoaded = visible.length >= filtered.length;
  const hasMore = !exhaustedLoaded || (onFastPath && archiveTotal > filtered.length);
  const showSkeleton = loading && visible.length === 0;

  const handleLoadMore = useCallback(() => {
    if (!exhaustedLoaded) {
      setPage((p) => p + 1);
      return;
    }
    // Paged past everything default.json holds — switch to the full archive.
    setForceFull(true);
    setPage((p) => p + 1);
  }, [exhaustedLoaded]);

  const countLabel = `${formatNumber(visible.length)} of ${formatNumber(totalForView)}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <FilterRail manifest={manifest} filters={filters} onChange={handleFiltersChange} />

      <div className="min-w-0">
        <div className="sticky top-10 z-20 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-kraft bg-masa/95 px-1 py-2 backdrop-blur">
          <p className="font-mono text-xs text-ink/70" aria-live="polite">
            Showing{" "}
            <motion.span
              key={countLabel}
              className="tnum inline-block font-semibold text-ink"
              initial={reducedMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {countLabel}
            </motion.span>{" "}
            items
            {loading && visible.length > 0 && (
              <span className="ml-2 text-ink/45">loading the walk-in…</span>
            )}
          </p>
          <label className="flex items-center gap-2 font-mono text-xs text-ink/70">
            <span>Sort</span>
            <select
              value={filters.sort}
              onChange={(event) =>
                handleFiltersChange({ ...filters, sort: parseSort(event.target.value) })
              }
              className="rounded border border-kraft bg-crema px-2 py-1 font-mono text-xs text-ink"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error !== null && (
          <div className="mt-6 rounded-md border border-chile/40 bg-crema/60 p-4" role="alert">
            <p className="font-mono text-sm text-chile">{error}</p>
            <button
              type="button"
              onClick={() => void loadForFilters(filters, forceFull)}
              className="mt-2 rounded border border-kraft bg-crema px-3 py-1 font-mono text-xs text-ink hover:border-kraft-deep"
            >
              Retry
            </button>
          </div>
        )}

        {error === null && showSkeleton && (
          <>
            <p className="mt-4 font-mono text-xs text-ink/50" role="status">
              loading the walk-in…
            </p>
            <SkeletonRows />
          </>
        )}

        {error === null && !showSkeleton && visible.length === 0 && (
          <p className="mt-8 font-mono text-sm text-ink/60">
            No items on record for this filter.
          </p>
        )}

        {error === null && visible.length > 0 && (
          <section aria-label="Archive items">
            {visible.map((item) => (
              <ResultRow key={item.id} item={item} />
            ))}
          </section>
        )}

        {error === null && !showSkeleton && hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loading}
              className="rounded border border-kraft bg-crema px-5 py-2 font-mono text-xs uppercase tracking-[0.14em] text-ink transition-colors hover:border-kraft-deep disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
