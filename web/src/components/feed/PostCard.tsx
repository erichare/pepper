"use client";

import type { FeedPost } from "@/lib/types";
import { formatNumber, formatScore, timeAgo } from "@/lib/format";
import { ReplyButton } from "./ReplyButton";

export interface PostCardProps {
  post: FeedPost;
}

function scoreClass(score: number): string {
  if (score > 0) return "text-upvote";
  if (score < 0) return "text-downvote";
  return "text-ink/60";
}

function MediaBlock({ post }: { post: FeedPost }) {
  if (post.gallery && post.gallery.length > 0) {
    const [first] = post.gallery;
    const extra = post.gallery.length - 1;
    return (
      <div className="relative mt-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote reddit URLs; next/image needs remotePatterns config we don't own */}
        <img
          src={first.url}
          loading="lazy"
          className="max-h-96 w-full rounded object-cover"
          alt=""
        />
        {extra > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-board/80 px-2 py-0.5 font-mono text-xs text-masa">
            +{extra}
          </span>
        )}
      </div>
    );
  }

  if (post.preview) {
    return (
      <div className="relative mt-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote reddit URLs; next/image needs remotePatterns config we don't own */}
        <img
          src={post.preview.url}
          loading="lazy"
          className="max-h-96 w-full rounded object-cover"
          alt=""
        />
        {post.isVideo && (
          <span className="absolute right-2 top-2 rounded bg-board/80 px-2 py-0.5 font-mono text-[0.65rem] tracking-[0.14em] text-masa">
            VIDEO
          </span>
        )}
      </div>
    );
  }

  return null;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="rounded-lg border border-kraft bg-crema p-4 shadow-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-ink/60">
        <span>r/Chipotle</span>
        <span aria-hidden="true">·</span>
        <span>u/{post.author}</span>
        <span aria-hidden="true">·</span>
        <span suppressHydrationWarning>{timeAgo(post.createdUtc)}</span>
        {post.flair && (
          <span className="rounded-full border border-kraft-deep/50 bg-kraft/50 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-ink/80">
            {post.flair}
          </span>
        )}
      </p>

      <h2 className="mt-2 font-semibold leading-snug text-ink">{post.title}</h2>

      {post.selftext.length > 0 && (
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-ink/80">
          {post.selftext}
        </p>
      )}

      <MediaBlock post={post} />

      <div className="mt-3 flex items-center gap-4 font-mono text-xs">
        <span className={`tnum font-semibold ${scoreClass(post.score)}`}>
          {formatScore(post.score)}
        </span>
        <span className="tnum text-ink/60">{formatNumber(post.numComments)} comments</span>
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-ink/70 underline-offset-2 hover:text-chile hover:underline"
        >
          open →
        </a>
      </div>

      <div className="mt-3">
        <ReplyButton post={post} />
      </div>
    </article>
  );
}
