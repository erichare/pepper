"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { analysis } from "@/lib/data";
import { formatNumber } from "@/lib/format";

/* ── data bindings ──────────────────────────────────────────────── */

const totals = analysis.stats.totals;

const TOTAL_KARMA_ABS = Math.abs(analysis.stats.karma.total_score);

const MS_PER_DAY = 86_400_000;
const DAYS_ON_THE_LINE = Math.round(
  (Date.parse(totals.last_activity) - Date.parse(totals.first_activity)) / MS_PER_DAY,
);

const CHIPOTLE_COUNT =
  analysis.stats.subreddits.find((s) => s.subreddit === "Chipotle")?.count ??
  analysis.stats.subreddits[0]?.count ??
  0;

interface StatChipData {
  value: number;
  suffix: string;
}

const STAT_CHIPS: readonly StatChipData[] = [
  { value: totals.items, suffix: "items" },
  { value: totals.subreddits, suffix: "subreddits" },
  { value: CHIPOTLE_COUNT, suffix: "in r/Chipotle" },
  { value: DAYS_ON_THE_LINE, suffix: "days on the line" },
];

/* ── odometer construction ──────────────────────────────────────── */

const COUNT_MS = 2800;
const CHIP_COUNT_MS = 1800;
const CHIP_STAGGER_MS = 140;

type OdometerCell = { kind: "digit"; place: number } | { kind: "comma" };

/** "11,332" → digit cells tagged with their decimal place; commas stay static glyphs. */
function buildOdometerCells(total: number): readonly OdometerCell[] {
  const chars = formatNumber(total).split("");
  const digitCount = chars.filter((c) => c !== ",").length;
  let seen = 0;
  return chars.map((c) => {
    if (c === ",") return { kind: "comma" as const };
    seen += 1;
    return { kind: "digit" as const, place: 10 ** (digitCount - seen) };
  });
}

const ODOMETER_CELLS = buildOdometerCells(TOTAL_KARMA_ABS);
const ODOMETER_LABEL = `Total karma: minus ${formatNumber(TOTAL_KARMA_ABS)}`;

const CELL_CLASS =
  "foil relative flex h-[1.3em] items-center justify-center overflow-hidden rounded-md shadow-[inset_0_2px_8px_rgba(0,0,0,0.35)]";
const CELL_TEXT_CLASS = "tnum block font-mono font-bold leading-none text-downvote";

/* ── odometer pieces ────────────────────────────────────────────── */

/** Horizontal seam across the middle of a cell — the split-flap hinge line. */
function FlapSeam() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-ink/25"
    />
  );
}

/** Static comma glyph rendered between cells at the thousands break. */
function OdometerComma() {
  return (
    <span
      aria-hidden="true"
      className="tnum self-end pb-[0.08em] font-mono font-bold leading-none text-downvote"
    >
      ,
    </span>
  );
}

interface StaticCellProps {
  char: string;
  narrow?: boolean;
}

/** Reduced-motion / final-state cell: no flip, just the settled character. */
function StaticCell({ char, narrow = false }: StaticCellProps) {
  return (
    <span aria-hidden="true" className={`${CELL_CLASS} ${narrow ? "w-[0.72em]" : "w-[0.85em]"}`}>
      <span className={CELL_TEXT_CLASS}>{char}</span>
      <FlapSeam />
    </span>
  );
}

interface FlipDigitProps {
  value: MotionValue<number>;
  place: number;
}

/**
 * One split-flap digit. Derives its character from the shared spring via
 * useTransform; every character change remounts the card, which rotates in
 * from the top hinge — rapid changes on low places read as flap spin.
 */
function FlipDigit({ value, place }: FlipDigitProps) {
  const digitValue = useTransform(
    value,
    (v) => Math.floor(Math.max(0, Math.round(v)) / place) % 10,
  );
  const [digit, setDigit] = useState(0);

  useMotionValueEvent(digitValue, "change", (d) => setDigit(d));

  return (
    <span aria-hidden="true" className={`${CELL_CLASS} w-[0.85em]`}>
      <motion.span
        key={digit}
        initial={{ rotateX: -80, opacity: 0.25 }}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        style={{ transformOrigin: "50% 0%", backfaceVisibility: "hidden" }}
        className={CELL_TEXT_CLASS}
      >
        {digit}
      </motion.span>
      <FlapSeam />
    </span>
  );
}

interface MinusCellProps {
  stamped: boolean;
}

/** The minus sign stamps in (scale 1.4 → 1 spring) once the count settles. */
function MinusCell({ stamped }: MinusCellProps) {
  return (
    <span aria-hidden="true" className={`${CELL_CLASS} w-[0.72em]`}>
      <motion.span
        initial={false}
        animate={stamped ? { scale: 1, opacity: 1 } : { scale: 1.4, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 16 }}
        className={CELL_TEXT_CLASS}
      >
        −
      </motion.span>
      <FlapSeam />
    </span>
  );
}

interface SplitFlapOdometerProps {
  started: boolean;
  reduced: boolean;
}

/** Menu-board split-flap counter: one spring 0 → 11,332, six flip cells. */
function SplitFlapOdometer({ started, reduced }: SplitFlapOdometerProps) {
  const count = useSpring(0, { duration: COUNT_MS, bounce: 0 });
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
    if (!started || reduced) return;
    const unsubscribe = count.on("animationComplete", () => setStamped(true));
    count.set(TOTAL_KARMA_ABS);
    return unsubscribe;
  }, [started, reduced, count]);

  return (
    <div
      role="img"
      aria-label={ODOMETER_LABEL}
      className="flex items-center justify-center gap-[0.1em]"
      style={{ fontSize: "clamp(2.5rem, 8.5vw, 5.5rem)", perspective: "700px" }}
    >
      {reduced ? (
        <>
          <StaticCell char="−" narrow />
          {formatNumber(TOTAL_KARMA_ABS)
            .split("")
            .map((c, i) =>
              c === "," ? <OdometerComma key={`c-${i}`} /> : <StaticCell key={`d-${i}`} char={c} />,
            )}
        </>
      ) : (
        <>
          <MinusCell stamped={stamped} />
          {ODOMETER_CELLS.map((cell, i) =>
            cell.kind === "comma" ? (
              <OdometerComma key={`c-${i}`} />
            ) : (
              <FlipDigit key={`d-${i}`} value={count} place={cell.place} />
            ),
          )}
        </>
      )}
    </div>
  );
}

/* ── stat chips ─────────────────────────────────────────────────── */

interface StatChipProps {
  value: number;
  suffix: string;
  started: boolean;
  reduced: boolean;
  delayMs: number;
}

/** Foil pill with its own staggered count-up spring. */
function StatChip({ value, suffix, started, reduced, delayMs }: StatChipProps) {
  const springValue = useSpring(0, { duration: CHIP_COUNT_MS, bounce: 0 });
  const [shown, setShown] = useState(0);

  useMotionValueEvent(springValue, "change", (v) => setShown(Math.round(v)));

  useEffect(() => {
    if (!started || reduced) return;
    const timer = setTimeout(() => springValue.set(value), delayMs);
    return () => clearTimeout(timer);
  }, [started, reduced, springValue, value, delayMs]);

  return (
    <span className="foil tnum inline-flex items-baseline gap-1.5 rounded-full px-4 py-2 font-mono text-sm text-ink shadow-[inset_0_1px_3px_rgba(0,0,0,0.25)]">
      <span
        aria-hidden="true"
        className="inline-block text-right font-semibold"
        style={{ minWidth: `${formatNumber(value).length}ch` }}
      >
        {formatNumber(reduced ? value : shown)}
      </span>
      <span aria-hidden="true" className="text-ink/70">
        {suffix}
      </span>
      <span className="sr-only">{`${formatNumber(value)} ${suffix}`}</span>
    </span>
  );
}

/* ── scroll cue ─────────────────────────────────────────────────── */

function ForkIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3v5a4 4 0 0 0 8 0V3" />
      <path d="M12 3v5" />
      <path d="M12 12v9" />
    </svg>
  );
}

interface ScrollCueProps {
  reduced: boolean;
}

function ScrollCue({ reduced }: ScrollCueProps) {
  return (
    <div aria-hidden="true" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-masa/50">
      <motion.div
        animate={reduced ? undefined : { y: [0, 8, 0] }}
        transition={reduced ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <ForkIcon />
      </motion.div>
    </div>
  );
}

/* ── hero ───────────────────────────────────────────────────────── */

/**
 * "The Legend of the Line" — full-viewport dark menu board with the
 * split-flap karma odometer and count-up stat chips.
 */
export function Hero() {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(contentRef, { once: true, amount: 0.4 });
  const reduced = useReducedMotion() === true;

  return (
    <header className="dark-section grain relative flex min-h-[92svh] flex-col items-center justify-center overflow-hidden bg-board px-4 py-24 text-center text-masa">
      <div ref={contentRef} className="relative flex w-full max-w-5xl flex-col items-center">
        <p className="kicker">CASE FILE · ACTIVE SINCE JUNE 2020</p>
        <h1
          className="display mt-4 text-crema"
          style={{ fontSize: "clamp(3.5rem, 10vw, 8.5rem)", textTransform: "none" }}
        >
          u/newppinpoint
        </h1>
        <p className="mt-6 max-w-2xl text-base text-masa/70 sm:text-lg">
          Line employee. Ex–sandwich artist. Net worth $20–50M (self-reported). 5,500 calories a
          day.
        </p>
        <div className="mt-10">
          <SplitFlapOdometer started={inView} reduced={reduced} />
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {STAT_CHIPS.map((chip, i) => (
            <StatChip
              key={chip.suffix}
              value={chip.value}
              suffix={chip.suffix}
              started={inView}
              reduced={reduced}
              delayMs={i * CHIP_STAGGER_MS}
            />
          ))}
        </div>
      </div>
      <ScrollCue reduced={reduced} />
    </header>
  );
}
