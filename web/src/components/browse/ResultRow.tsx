"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { BrowseItem } from "@/lib/types";
import { formatScore, formatUtcDate } from "@/lib/format";

interface ResultRowProps {
  item: BrowseItem;
}

function scoreColor(score: number | null): string {
  if (score === null || score === 0) return "text-ink/40";
  return score > 0 ? "text-upvote" : "text-downvote";
}

function statusLabel(status: string): string | null {
  if (status === "removed_by_mod") return "REMOVED BY MODS";
  if (status === "deleted") return "DELETED";
  return null;
}

/** First non-empty line of a body, for the collapsed comment preview. */
function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim().length > 0) ?? "";
}

export function ResultRow({ item }: ResultRowProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  const isSubmission = item.type === "submission";
  const preview = isSubmission ? (item.title ?? "") : firstLine(item.body ?? "");
  const status = statusLabel(item.status);

  const toggle = () => setOpen((value) => !value);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  const stopBubble = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={handleKeyDown}
      className="cursor-pointer border-b border-kraft py-3 transition-colors hover:bg-crema/50"
    >
      <div className="flex items-baseline gap-3">
        <span
          className={`tnum min-w-14 shrink-0 text-right font-mono text-sm ${scoreColor(item.score)}`}
        >
          {item.score === null ? "—" : formatScore(item.score)}
        </span>
        <span
          className="shrink-0 rounded border border-kraft-deep/60 px-1 font-mono text-[10px] text-ink/60"
          title={isSubmission ? "submission" : "comment"}
        >
          <span aria-hidden="true">{isSubmission ? "S" : "C"}</span>
          <span className="sr-only">{isSubmission ? "submission" : "comment"}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-ink/60">
            r/{item.subreddit ?? "unknown"} · {formatUtcDate(item.created_utc)}
            {status !== null && (
              <span className="stamp ml-2 text-[9px] text-chile">{status}</span>
            )}
          </p>
          <p className={`mt-0.5 truncate text-sm ${isSubmission ? "font-medium" : ""}`}>
            {preview || <span className="text-ink/40">[no text]</span>}
          </p>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="mt-3 space-y-3"
              >
                {isSubmission && item.title !== null && (
                  <p className="whitespace-pre-wrap text-sm font-medium">{item.title}</p>
                )}
                {item.body !== null && item.body.trim() !== "" && (
                  <p className="whitespace-pre-wrap text-sm text-ink/90">{item.body}</p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {item.has_media && (
                    <span className="rounded border border-kraft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50">
                      media attached
                    </span>
                  )}
                  {item.permalink !== null && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={stopBubble}
                      onKeyDown={stopBubble}
                      className="font-mono text-xs text-chile underline underline-offset-2 hover:text-chile-deep"
                    >
                      open on reddit →
                    </a>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
