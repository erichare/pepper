import type { ReactNode } from "react";
import { PepperGlyph } from "@/components/PepperGlyph";
import { formatScore, formatUtcDate, timeAgo } from "@/lib/format";

export interface RedditCommentProps {
  author: string;
  body: string;
  score: number;
  /** Unix seconds. */
  createdUtc: number;
  permalink: string | null;
  subreddit: string | null;
  /** Optional overlay rendered at the card's top-right corner (e.g. a score stamp). */
  badge?: ReactNode;
  /** Extra classes on the card root (e.g. height constraints inside decks). */
  className?: string;
}

interface VoteArrowProps {
  direction: "up" | "down";
}

/** Static, un-voted reddit arrow. Neutral by design — score color carries the semantics. */
function VoteArrow({ direction }: VoteArrowProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-ink/30 ${direction === "down" ? "rotate-180" : ""}`}
    >
      <path d="M8 1.5 14.5 9h-3.75v5.5h-5.5V9H1.5L8 1.5z" />
    </svg>
  );
}

function scoreClass(score: number): string {
  if (score < 0) return "text-downvote";
  if (score > 0) return "text-upvote";
  return "text-ink/50";
}

/**
 * Shared presentational reddit-comment card: pepper-snoo avatar, mono
 * meta line, pre-wrapped body, static vote arrows with a sign-colored
 * score, and a permalink out to the live thread.
 */
export function RedditComment({
  author,
  body,
  score,
  createdUtc,
  permalink,
  subreddit,
  badge,
  className = "",
}: RedditCommentProps) {
  const meta = [`u/${author}`, subreddit ? `r/${subreddit}` : null, timeAgo(createdUtc)]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`relative flex flex-col rounded-lg border border-kraft bg-crema p-4 text-ink shadow-sm ${className}`}
    >
      {badge && <div className="pointer-events-none absolute right-3 top-3 z-10">{badge}</div>}
      <header className="flex items-center gap-2 pr-16">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chile text-crema"
        >
          <PepperGlyph className="h-3.5 w-3.5" />
        </span>
        <span className="truncate font-mono text-xs text-ink/60" suppressHydrationWarning>
          {meta}
        </span>
      </header>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
        {body}
      </div>
      <footer className="mt-3 flex items-center gap-1.5 border-t border-ink/10 pt-2.5">
        <VoteArrow direction="up" />
        <span className={`tnum text-sm font-bold ${scoreClass(score)}`}>{formatScore(score)}</span>
        <VoteArrow direction="down" />
        {permalink ? (
          <a
            href={permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-right font-mono text-[11px] text-ink/50 underline-offset-2 hover:text-chile hover:underline"
          >
            {formatUtcDate(createdUtc)} · see it in the wild →
          </a>
        ) : (
          <span className="ml-auto font-mono text-[11px] text-ink/50">
            {formatUtcDate(createdUtc)}
          </span>
        )}
      </footer>
    </article>
  );
}
