"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { scaleBand, scaleLinear } from "d3-scale";
import { Section } from "@/components/Section";
import { analysis, hallOfFame } from "@/lib/data";
import { formatNumber, formatScore, formatUtcDate } from "@/lib/format";

/* ── chart geometry (viewBox units) ─────────────────────────────── */

const VB_W = 900;
const VB_H = 420;
const MARGIN = { top: 30, right: 20, bottom: 34, left: 60 } as const;
const AXIS_Y = VB_H - MARGIN.bottom;
const POS_GRADIENT_ID = "pepper-karma-positive";

/* ── waterfall model ─────────────────────────────────────────────── */

interface BarGeom {
  year: number;
  delta: number;
  start: number;
  end: number;
  x: number;
  cx: number;
  w: number;
  top: number;
  h: number;
  isNeg: boolean;
}

const KARMA = analysis.stats.karma;
const BY_YEAR = [...KARMA.by_year].sort((a, b) => a.year - b.year);

const RAW_BARS = BY_YEAR.reduce<{ year: number; delta: number; start: number; end: number }[]>(
  (acc, { year, score }) => {
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    return [...acc, { year, delta: score, start, end: start + score }];
  },
  [],
);

const LO = Math.min(0, ...RAW_BARS.map((b) => Math.min(b.start, b.end)));
const HI = Math.max(0, ...RAW_BARS.map((b) => Math.max(b.start, b.end)));
const PAD = (HI - LO) * 0.055 || 1;

const yScale = scaleLinear()
  .domain([LO - PAD, HI + PAD])
  .range([AXIS_Y, MARGIN.top]);

const xScale = scaleBand<string>()
  .domain(RAW_BARS.map((b) => String(b.year)))
  .range([MARGIN.left, VB_W - MARGIN.right])
  .paddingInner(0.35)
  .paddingOuter(0.18);

const GEOMS: BarGeom[] = RAW_BARS.map((bar) => {
  const x = xScale(String(bar.year)) ?? MARGIN.left;
  const w = xScale.bandwidth();
  const isNeg = bar.delta < 0;
  const h = Math.max(2, Math.abs(yScale(bar.start) - yScale(bar.end)));
  const top = isNeg ? yScale(bar.start) : yScale(bar.start) - h;
  return { ...bar, x, cx: x + w / 2, w, top, h, isNeg };
});

const FINAL_TOTAL = GEOMS.length > 0 ? GEOMS[GEOMS.length - 1].end : 0;
const LAST = GEOMS[GEOMS.length - 1];
const GOLDEN = GEOMS.find((b) => b.year === 2022 && b.delta > 0) ?? null;
const Y_TICKS = yScale.ticks(4);

const POINTS = GEOMS.map((g) => ({ x: g.cx, y: yScale(g.end) }));
const SEGMENTS = POINTS.slice(1).map((p, i) => ({
  x1: POINTS[i].x,
  y1: POINTS[i].y,
  x2: p.x,
  y2: p.y,
}));

const BAR_DELAY = 0.12;
const BAR_STAGGER = 0.08;
const LINE_DELAY = BAR_DELAY + GEOMS.length * BAR_STAGGER + 0.25;

/* ── plaque data ─────────────────────────────────────────────────── */

const HOF_POOL = [
  ...hallOfFame.top_submissions,
  ...hallOfFame.top_comments,
  ...hallOfFame.bottom_comments,
  ...hallOfFame.bottom_submissions,
];
const BEST_ITEM = HOF_POOL.find((item) => item.score === KARMA.max_score) ?? null;
const WORST_ITEM = HOF_POOL.find((item) => item.score === KARMA.min_score) ?? null;

/* ── sub-pieces ──────────────────────────────────────────────────── */

interface AnimProps {
  show: boolean;
  reduce: boolean;
}

function YGrid() {
  return (
    <g aria-hidden="true">
      {Y_TICKS.map((tick) => (
        <g key={tick}>
          <line
            x1={MARGIN.left}
            x2={VB_W - MARGIN.right}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="var(--ink)"
            strokeOpacity={tick === 0 ? 0.45 : 0.12}
          />
          <text
            x={MARGIN.left - 7}
            y={yScale(tick) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--ink)"
            fillOpacity={0.55}
            className="tnum font-mono"
          >
            {formatScore(tick)}
          </text>
        </g>
      ))}
      <line
        x1={MARGIN.left}
        x2={VB_W - MARGIN.right}
        y1={AXIS_Y}
        y2={AXIS_Y}
        stroke="var(--ink)"
        strokeOpacity={0.35}
      />
      {GEOMS.map((bar) => (
        <text
          key={bar.year}
          x={bar.cx}
          y={AXIS_Y + 18}
          textAnchor="middle"
          fontSize={11}
          fill="var(--ink)"
          fillOpacity={0.6}
          className="tnum font-mono"
        >
          {bar.year}
        </text>
      ))}
    </g>
  );
}

function WaterfallBars({ show, reduce }: AnimProps) {
  return (
    <g>
      {GEOMS.map((bar, i) => (
        <g key={bar.year}>
          <motion.rect
            x={bar.x}
            y={bar.top}
            width={bar.w}
            height={bar.h}
            rx={1.5}
            fill={bar.isNeg ? "var(--chile)" : `url(#${POS_GRADIENT_ID})`}
            style={{ originX: 0.5, originY: bar.isNeg ? 0 : 1 }}
            initial={reduce ? false : { scaleY: 0 }}
            animate={show ? { scaleY: 1 } : undefined}
            transition={{
              type: "spring",
              stiffness: 130,
              damping: bar.isNeg ? 10 : 17,
              mass: 0.9,
              delay: BAR_DELAY + i * BAR_STAGGER,
            }}
          />
          <motion.text
            x={bar.cx}
            y={bar.isNeg ? bar.top + bar.h + 13 : bar.top - 6}
            textAnchor="middle"
            fontSize={10.5}
            fill={bar.isNeg ? "var(--chile)" : "var(--guac)"}
            stroke="var(--masa)"
            strokeWidth={3}
            paintOrder="stroke"
            className="tnum font-mono"
            initial={reduce ? false : { opacity: 0 }}
            animate={show ? { opacity: 1 } : undefined}
            transition={{ duration: 0.3, delay: BAR_DELAY + i * BAR_STAGGER + 0.28 }}
          >
            {formatScore(bar.delta)}
          </motion.text>
        </g>
      ))}
    </g>
  );
}

/** Dotted cumulative guide, revealed segment-by-segment left to right. */
function CumulativeLine({ show, reduce }: AnimProps) {
  return (
    <g aria-hidden="true">
      {SEGMENTS.map((seg, i) => (
        <motion.line
          key={`${seg.x1}-${seg.x2}`}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke="var(--ink)"
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeDasharray="0.5 5"
          strokeLinecap="round"
          initial={reduce ? false : { opacity: 0 }}
          animate={show ? { opacity: 1 } : undefined}
          transition={{ duration: 0.3, delay: LINE_DELAY + i * 0.14, ease: "easeOut" }}
        />
      ))}
    </g>
  );
}

/** Tiny gold pennant on the one good year. */
function GoldenFlag({ show, reduce }: AnimProps) {
  if (!GOLDEN) return null;
  const topY = GOLDEN.top;
  return (
    <motion.g
      aria-hidden="true"
      initial={reduce ? false : { opacity: 0 }}
      animate={show ? { opacity: 1 } : undefined}
      transition={{ duration: 0.4, delay: BAR_DELAY + 2 * BAR_STAGGER + 0.45 }}
    >
      <line
        x1={GOLDEN.cx}
        x2={GOLDEN.cx}
        y1={topY}
        y2={topY - 30}
        stroke="var(--gold)"
        strokeWidth={1.5}
      />
      <path
        d={`M ${GOLDEN.cx} ${topY - 30} h 92 l -6 6.5 l 6 6.5 h -92 z`}
        fill="var(--gold)"
      />
      <text
        x={GOLDEN.cx + 6}
        y={topY - 20.5}
        fontSize={8}
        letterSpacing="0.09em"
        fill="var(--board)"
        className="font-mono"
      >
        THE GOLDEN ERA
      </text>
    </motion.g>
  );
}

function SrTable() {
  return (
    <table className="sr-only">
      <caption>Karma earned per year with running total</caption>
      <thead>
        <tr>
          <th scope="col">Year</th>
          <th scope="col">Karma</th>
          <th scope="col">Running total</th>
        </tr>
      </thead>
      <tbody>
        {GEOMS.map((bar) => (
          <tr key={bar.year}>
            <th scope="row">{bar.year}</th>
            <td>{formatScore(bar.delta)}</td>
            <td>{formatScore(bar.end)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WaterfallViz() {
  const reduceMotion = useReducedMotion();
  const reduce = Boolean(reduceMotion);
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const show = reduce || inView;

  const ariaLabel =
    `Waterfall chart of yearly karma: ` +
    GEOMS.map((bar) => `${bar.year} ${formatScore(bar.delta)}`).join(", ") +
    `. Cumulative total ends at ${formatScore(FINAL_TOTAL)}.`;

  return (
    <div ref={ref} className="relative">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full select-none"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={POS_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--guac)" />
          </linearGradient>
        </defs>
        <YGrid />
        <WaterfallBars show={show} reduce={reduce} />
        <CumulativeLine show={show} reduce={reduce} />
        <GoldenFlag show={show} reduce={reduce} />
      </svg>
      {LAST && (
        <motion.span
          className="stamp tnum absolute font-mono text-sm text-downvote sm:text-base"
          style={{
            left: `${(LAST.cx / VB_W) * 100}%`,
            top: `${(yScale(FINAL_TOTAL) / VB_H) * 100}%`,
            translate: "-50% -185%",
          }}
          initial={reduce ? false : { opacity: 0, scale: 1.6, rotate: -4 }}
          animate={show ? { opacity: 1, scale: 1, rotate: -4 } : undefined}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 20,
            delay: LINE_DELAY + SEGMENTS.length * 0.14 + 0.15,
          }}
          aria-hidden="true"
        >
          {formatScore(FINAL_TOTAL)}
        </motion.span>
      )}
      <SrTable />
    </div>
  );
}

/* ── employee-of-the-month plaques ───────────────────────────────── */

const SCREW_POSITIONS = [
  "left-1.5 top-1.5",
  "right-1.5 top-1.5",
  "left-1.5 bottom-1.5",
  "right-1.5 bottom-1.5",
];

interface PlaqueProps {
  heading: string;
  score: number;
  scoreClass: string;
  children: ReactNode;
}

function Plaque({ heading, score, scoreClass, children }: PlaqueProps) {
  return (
    <div className="relative rounded-md border-4 border-gold/60 bg-board p-4 font-mono text-masa">
      {SCREW_POSITIONS.map((pos) => (
        <span
          key={pos}
          aria-hidden="true"
          className={`absolute ${pos} h-1.5 w-1.5 rounded-full bg-gold/40`}
        />
      ))}
      <p className="text-[10px] uppercase tracking-[0.2em] text-gold">{heading}</p>
      <p className={`tnum mt-2 text-3xl font-bold ${scoreClass}`}>{formatScore(score)}</p>
      <div className="mt-2 text-xs leading-relaxed text-masa/75">{children}</div>
    </div>
  );
}

function PlaqueRail() {
  const bestQuote = BEST_ITEM?.title ?? BEST_ITEM?.body ?? "";
  return (
    <aside
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 lg:content-start"
      aria-label="Highest and lowest scoring items"
    >
      <Plaque heading="Best — single item" score={KARMA.max_score} scoreClass="text-upvote">
        {bestQuote && <p>&ldquo;{bestQuote}&rdquo;</p>}
        {BEST_ITEM && (
          <p className="mt-2 text-[10px] uppercase tracking-wide text-masa/50">
            r/{BEST_ITEM.subreddit ?? "unknown"} · {formatUtcDate(BEST_ITEM.created_utc)}
          </p>
        )}
      </Plaque>
      <Plaque heading="Worst — single item" score={KARMA.min_score} scoreClass="text-downvote">
        <p>
          <a
            href="#hall-of-fame"
            className="underline decoration-gold/60 underline-offset-4 hover:text-masa"
          >
            See Hall of Fame
          </a>
        </p>
        {WORST_ITEM && (
          <p className="mt-2 text-[10px] uppercase tracking-wide text-masa/50">
            r/{WORST_ITEM.subreddit ?? "unknown"} · {formatUtcDate(WORST_ITEM.created_utc)}
          </p>
        )}
      </Plaque>
    </aside>
  );
}

/* ── section ─────────────────────────────────────────────────────── */

export function KarmaWaterfall() {
  return (
    <Section
      id="karma"
      index="№ 04"
      kicker="THE BILL"
      title="The Descent"
      subtitle="Yearly karma. It was going fine until it wasn't."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <WaterfallViz />
        <PlaqueRail />
        <p className="text-xs text-ink/50 lg:col-span-2">
          Cumulative karma across {formatNumber(analysis.stats.totals.items)} archived items.
          Bars show each year&rsquo;s net score; the dotted line tracks the running total.
        </p>
      </div>
    </Section>
  );
}
