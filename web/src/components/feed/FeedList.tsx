"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { FeedPost, FeedResponse, FeedSort } from "@/lib/types";
import { PostCard } from "./PostCard";

type TopWindow = "day" | "week";

export interface FeedListProps {
  initial: FeedResponse;
}

const SORTS: readonly FeedSort[] = ["hot", "new", "top"];
const WINDOWS: readonly TopWindow[] = ["day", "week"];
const MAX_PAGES = 4;

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initial.stale);
  const [pages, setPages] = useState(1);

  const replaceList = useCallback(async (nextSort: FeedSort, nextT: TopWindow) => {
    setLoading(true);
    setError(false);
    try {
      const feed = await requestFeed(nextSort, nextT, null);
      setPosts(feed.posts);
      setAfter(feed.after);
      setPages(1);
      setError(feed.stale);
    } catch {
      setPosts([]);
      setAfter(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (after === null || loading) return;
    setLoading(true);
    try {
      const feed = await requestFeed(sort, t, after);
      setPosts((current) => mergePosts(current, feed.posts));
      setAfter(feed.after);
      setPages((current) => current + 1);
    } catch {
      setPosts([]);
      setAfter(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [after, loading, sort, t]);

  const retry = useCallback(() => {
    void replaceList(sort, t);
  }, [replaceList, sort, t]);

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
              disabled={loading}
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
                disabled={loading}
                onClick={() => changeWindow(option)}
                className={segmentClass(t === option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {loading && <span className="text-ink/60">Loading…</span>}
      </div>

      <p aria-live="polite" className="sr-only">
        {loading ? "Loading posts" : `${posts.length} posts shown`}
      </p>

      {error ? (
        <div className="mt-6 rounded-lg border border-kraft-deep bg-kraft p-4">
          <p className="text-sm text-ink">
            Reddit isn&apos;t responding — showing nothing. Even Pepper has limits.
          </p>
          <button
            type="button"
            onClick={retry}
            disabled={loading}
            className="mt-3 rounded border border-ink/30 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-ink transition-colors hover:bg-crema"
          >
            Retry
          </button>
        </div>
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

          {!loading && posts.length === 0 && (
            <p className="mt-6 font-mono text-sm text-ink/60">
              No posts in this listing right now.
            </p>
          )}

          {after !== null && pages < MAX_PAGES && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className="mx-auto mt-8 block rounded-md border border-kraft-deep bg-crema px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-ink transition-colors hover:bg-kraft/40 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
