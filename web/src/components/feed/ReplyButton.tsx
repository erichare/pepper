"use client";

/**
 * "What would newppinpoint say?" — streams an AI-parody reply for a live
 * r/Chipotle post from /api/reply, renders it as a clearly-labeled reply
 * card, then plays the score gag: a fake score badge that decays from +1 to
 * a deterministic negative number. Regenerate requests a different take.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PepperGlyph } from "@/components/PepperGlyph";
import { formatScore, hashString, seededRandom } from "@/lib/format";
import type { FeedPost, ReplyMode } from "@/lib/types";

type ReplyStatus = "idle" | "streaming" | "done" | "limited" | "error";

const MODES: readonly ReplyMode[] = ["default", "zinger", "rant"];

const LIMIT_COPY: Record<string, string> = {
  rate_limited: "Blacklisted. Try again in a minute.",
  daily_budget_exhausted: "The register is closed for today.",
};

const ERROR_COPY = "Even Pepper couldn't help with this one. Retry?";

const SCORE_ANIMATION_MS = 2000;

/**
 * Deterministic decay sequence for the fake score badge: 1 → 0 → … → final,
 * where final is seeded from the post id and always lands in [−38, −4].
 */
function buildScoreSteps(postId: string): number[] {
  const rand = seededRandom(hashString(postId));
  const finalScore = -(4 + Math.floor(rand() * 35));
  const stepCount = 6;

  const middle: number[] = [];
  for (let i = 1; i < stepCount; i++) {
    const t = i / stepCount;
    const eased = t * t;
    const jitter = Math.floor(rand() * 2);
    middle.push(Math.max(finalScore, Math.min(0, Math.round(finalScore * eased) - jitter)));
  }
  const declining = middle.reduce<number[]>((acc, value) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
    return [...acc, Math.min(prev, value)];
  }, []);

  return [1, 0, ...declining, finalScore];
}

async function readErrorCode(res: Response): Promise<string> {
  try {
    const payload: unknown = await res.json();
    if (
      payload !== null &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
    ) {
      return (payload as { error: string }).error;
    }
  } catch {
    // Malformed error body — fall through to the generic code.
  }
  return "generation_failed";
}

interface ModeSelectProps {
  mode: ReplyMode;
  onChange: (mode: ReplyMode) => void;
  disabled: boolean;
}

function ModeSelect({ mode, onChange, disabled }: ModeSelectProps) {
  return (
    <div
      role="group"
      aria-label="Reply style"
      className="inline-flex overflow-hidden rounded-full border border-kraft-deep/60 font-mono text-[10px]"
    >
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          disabled={disabled}
          className={`px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === m ? "bg-board text-masa" : "bg-transparent text-ink/60 hover:text-ink"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function Caret({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return <span aria-hidden="true">▊</span>;
  }
  return (
    <motion.span
      aria-hidden="true"
      className="inline-block"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    >
      ▊
    </motion.span>
  );
}

export interface ReplyButtonProps {
  post: FeedPost;
}

export function ReplyButton({ post }: ReplyButtonProps) {
  const reduced = useReducedMotion() ?? false;
  const [status, setStatus] = useState<ReplyStatus>("idle");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ReplyMode>("default");
  const [notice, setNotice] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scoreTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearScoreTimer = useCallback(() => {
    if (scoreTimerRef.current !== null) {
      clearInterval(scoreTimerRef.current);
      scoreTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (scoreTimerRef.current !== null) clearInterval(scoreTimerRef.current);
    };
  }, []);

  // Score gag: decay the fake score from +1 down to a deterministic negative.
  // Driven from the completion path (an event-handler callback), not an effect,
  // so setState never fires synchronously during render.
  const runScoreGag = useCallback(() => {
    clearScoreTimer();
    const steps = buildScoreSteps(post.id);
    if (reduced) {
      setScore(steps[steps.length - 1]);
      return;
    }
    setScore(steps[0]);
    let i = 0;
    scoreTimerRef.current = setInterval(() => {
      i += 1;
      if (i >= steps.length) {
        clearScoreTimer();
        return;
      }
      setScore(steps[i]);
    }, Math.round(SCORE_ANIMATION_MS / steps.length));
  }, [post.id, reduced, clearScoreTimer]);

  // Rate-limit lockout matches its own copy: re-enable after a minute.
  useEffect(() => {
    if (status !== "limited") return;
    const timer = window.setTimeout(() => {
      setStatus(text.length > 0 ? "done" : "idle");
      setNotice(null);
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [status, text]);


  const generate = useCallback(
    async (regenerate: boolean): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const previous = regenerate && text.length > 0 ? text.slice(0, 2000) : null;
      clearScoreTimer();
      setStatus("streaming");
      setNotice(null);
      setScore(null);
      setText("");

      try {
        const res = await fetch("/api/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            postId: post.id,
            title: post.title.slice(0, 300),
            selftext: post.selftext.slice(0, 8000),
            flair: post.flair,
            mode,
            regenerate,
            previousReply: previous,
          }),
        });

        if (res.status === 429) {
          const code = await readErrorCode(res);
          setText(previous ?? "");
          setStatus("limited");
          setNotice(LIMIT_COPY[code] ?? LIMIT_COPY.rate_limited);
          return;
        }
        if (!res.ok || !res.body) {
          setText(previous ?? "");
          setStatus("error");
          setNotice(ERROR_COPY);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setText(acc);
        }
        acc += decoder.decode();

        if (acc.length === 0) {
          setText(previous ?? "");
          setStatus("error");
          setNotice(ERROR_COPY);
          return;
        }
        setText(acc);
        setStatus("done");
        runScoreGag();
      } catch {
        if (controller.signal.aborted) return;
        setText(previous ?? "");
        setStatus("error");
        setNotice(ERROR_COPY);
      }
    },
    [mode, post.flair, post.id, post.selftext, post.title, text, clearScoreTimer, runScoreGag],
  );

  const hasCard = status === "streaming" || text.length > 0;
  const busy = status === "streaming";

  return (
    <div className="mt-3">
      {!hasCard && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!busy && status !== "limited") void generate(false);
            }}
            disabled={status === "limited"}
            className="inline-flex items-center gap-2 rounded-full bg-chile px-4 py-2 text-sm font-medium text-crema transition-colors hover:bg-chile-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-crema/90" aria-hidden="true" />
            {status === "limited" && notice
              ? notice
              : status === "error" && notice
                ? notice
                : "What would newppinpoint say?"}
          </button>
          <ModeSelect mode={mode} onChange={setMode} disabled={busy} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {hasCard && (
          <motion.div
            key="reply-card"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="ml-4 rounded-r-lg border-l-4 border-chile bg-masa p-3 sm:ml-6 sm:p-4"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chile text-crema">
                <PepperGlyph className="h-3.5 w-3.5" />
              </span>
              <span className="font-mono text-xs font-medium text-ink">u/newppinpoint</span>
              <span className="rounded bg-board px-1.5 py-0.5 font-mono text-[10px] text-masa">
                🤖 AI parody — not the real newppinpoint
              </span>
              <span className="text-xs text-ink/50">· just now</span>
            </div>

            <div
              aria-live="polite"
              className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/90"
            >
              {text}
              {status === "streaming" && <Caret reduced={reduced} />}
            </div>

            {status !== "streaming" && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {status === "done" && score !== null && (
                  <span
                    className={`tnum font-mono text-xs ${
                      score < 0 ? "text-downvote" : "text-ink/50"
                    }`}
                  >
                    {score < 0 && <span aria-hidden="true">↓ </span>}
                    {formatScore(score)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (status !== "limited") void generate(true);
                  }}
                  disabled={status === "limited"}
                  className="rounded-full border border-kraft-deep/60 px-3 py-1 font-mono text-[11px] text-ink/70 transition-colors hover:border-chile hover:text-chile disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Regenerate
                </button>
                <ModeSelect mode={mode} onChange={setMode} disabled={false} />
                {notice && <span className="font-mono text-[11px] text-ink/60">{notice}</span>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
