"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { FeedPost, FeedResponse, FeedSort } from "@/lib/types";
import { PostCard } from "./PostCard";
import { FeedSkeleton } from "./FeedSkeleton";

type TopWindow = "day" | "week";

export interface FeedListProps {
  initial: FeedResponse;
}

const SORTS: readonly FeedSort[] = ["hot", "new", "top"];
const WINDOWS: readonly TopWindow[] = ["day", "week"];
const MAX_PAGES = 4;
/** How long a client-cached listing stays fresh before a switch-back refetches. */
const CLIENT_CACHE_TTL_MS = 90_000;

interface FeedCacheEntry {
  posts: FeedPost[];
  after: string | null;
  pages: number;
  stale: boolean;
  fetchedAt: number;
}

function cacheKey(sort: FeedSort, t: TopWindow): string {
  return `${sort}:${sort === "top" ? t : "all"}`;
}

async function requestFeed(
  sort: FeedSort,
  t: TopWindow,
  after: string | null,
): Promise<FeedResponse> {
  const params = new URLSearchParams({ sort });
  if (sort === "top") params.set("t", t);
  if (after !== null) params.set("after", after);
  const res = await fetch(`/api/feed?${params.toString()}`);
  if (!res.ok) throw new Error(`feed request failed: ${res.status}`);
  return (await res.json()) as FeedResponse;
}

function mergePosts(current: readonly FeedPost[], incoming: readonly FeedPost[]): FeedPost[] {
  const seen = new Set(current.map((post) => post.id));
  return [...current, ...incoming.filter((post) => !seen.has(post.id))];
}

const segmentClass = (active: boolean): string =>
  `px-3 py-1.5 uppercase tracking-[0.14em] transition-colors ${
    active ? "bg-chile text-crema" : "bg-crema text-ink/70 hover:bg-kraft/40"
  }`;

export function FeedList({ initial }: FeedListProps) {
  const reduceMotion = useReducedMotion();
  const [posts, setPosts] = useState<FeedPost[]>(initial.posts);
  const [after, setAfter] = useState<string | null>(initial.after);
  const [sort, setSort] = useState<FeedSort>(initial.sort);
  const [t, setT] = useState<TopWindow>("day");
  // `replacing` = fetching a whole new listing (show skeletons);
  // `appending` = fetching the next page (keep list, spinner on the button).
  const [replacing, setReplacing] = useState(false);
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState(initial.stale);
  const [pages, setPages] = useState(1);

  // Session cache of already-fetched listings, so switching sorts back and
  // forth is instant instead of re-hitting the (scraper-backed) API each time.
  const cacheRef = useRef<Map<string, FeedCacheEntry>>(new Map());
  useEffect(() => {
    // Seed with the server-rendered listing (Date.now() must run outside render).
    cacheRef.current.set(cacheKey(initial.sort, "day"), {
      posts: initial.posts,
      after: initial.after,
      pages: 1,
      stale: initial.stale,
      fetchedAt: Date.now(),
    });
  }, [initial]);

  const applyEntry = useCallback((entry: FeedCacheEntry) => {
    setPosts(entry.posts);
    setAfter(entry.after);
    setPages(entry.pages);
    setError(entry.stale);
  }, []);

  const replaceList = useCallback(
    async (nextSort: FeedSort, nextT: TopWindow) => {
      const key = cacheKey(nextSort, nextT);
      const cached = cacheRef.current?.get(key);
      if (cached && Date.now() - cached.fetchedAt < CLIENT_CACHE_TTL_MS) {
        applyEntry(cached); // instant — no network, no skeleton
        return;
      }
      setReplacing(true);
      setError(false);
      try {
        const feed = await requestFeed(nextSort, nextT, null);
        const entry: FeedCacheEntry = {
          posts: feed.posts,
          after: feed.after,
          pages: 1,
          stale: feed.stale,
          fetchedAt: Date.now(),
        };
        cacheRef.current?.set(key, entry);
        applyEntry(entry);
      } catch {
        setPosts([]);
        setAfter(null);
        setError(true);
      } finally {
        setReplacing(false);
      }
    },
    [applyEntry],
  );

  const changeSort = useCallback(
    (next: FeedSort) => {
      if (next === sort && !error) return;
      setSort(next);
      void replaceList(next, t);
    },
    [sort, t, error, replaceList],
  );

  const changeWindow = useCallback(
    (next: TopWindow) => {
      if (next === t) return;
      setT(next);
      void replaceList(sort, next);
    },
    [sort, t, replaceList],
  );

  const loadMore = useCallback(async () => {
    if (after === null || replacing || appending) return;
    setAppending(true);
    try {
      const feed = await requestFeed(sort, t, after);
      const merged = mergePosts(posts, feed.posts);
      const nextPages = pages + 1;
      setPosts(merged);
      setAfter(feed.after);
      setPages(nextPages);
      cacheRef.current?.set(cacheKey(sort, t), {
        posts: merged,
        after: feed.after,
        pages: nextPages,
        stale: error,
        fetchedAt: Date.now(),
      });
    } catch {
      setError(true);
    } finally {
      setAppending(false);
    }
  }, [after, replacing, appending, sort, t, posts, pages, error]);

  const retry = useCallback(() => {
    void replaceList(sort, t);
  }, [replaceList, sort, t]);

  const busy = replacing || appending;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
        <div
          role="group"
          aria-label="Sort posts"
          className="inline-flex overflow-hidden rounded-md border border-kraft-deep"
        >
          {SORTS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sort === option}
              disabled={busy}
              onClick={() => changeSort(option)}
              className={segmentClass(sort === option)}
            >
              {option}
            </button>
          ))}
        </div>
        {sort === "top" && (
          <div
            role="group"
            aria-label="Top time window"
            className="inline-flex overflow-hidden rounded-md border border-kraft-deep"
          >
            {WINDOWS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={t === option}
                disabled={busy}
                onClick={() => changeWindow(option)}
                className={segmentClass(t === option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {replacing && (
          <span className="inline-flex items-center gap-2 text-ink/60">
            <Spinner /> loading r/Chipotle…
          </span>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {replacing ? "Loading posts" : `${posts.length} posts shown`}
      </p>

      {error && !replacing ? (
        <div className="mt-6 rounded-lg border border-kraft-deep bg-kraft p-4">
          <p className="text-sm text-ink">
            Reddit isn&apos;t responding — showing nothing. Even Pepper has limits.
          </p>
          <button
            type="button"
            onClick={retry}
            disabled={busy}
            className="mt-3 rounded border border-ink/30 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-ink transition-colors hover:bg-crema"
          >
            Retry
          </button>
        </div>
      ) : replacing ? (
        <FeedSkeleton count={5} />
      ) : (
        <>
          <ul className="mt-6 space-y-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {posts.map((post) => (
                <motion.li
                  key={post.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <PostCard post={post} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {posts.length === 0 && (
            <p className="mt-6 font-mono text-sm text-ink/60">
              No posts in this listing right now.
            </p>
          )}

          {after !== null && pages < MAX_PAGES && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={busy}
              className="mx-auto mt-8 flex items-center gap-2 rounded-md border border-kraft-deep bg-crema px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-ink transition-colors hover:bg-kraft/40 disabled:opacity-60"
            >
              {appending ? (
                <>
                  <Spinner /> loading…
                </>
              ) : (
                "Load more"
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Small spinning indicator; static under reduced motion. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ink/25 border-t-chile motion-reduce:animate-none"
    />
  );
}
