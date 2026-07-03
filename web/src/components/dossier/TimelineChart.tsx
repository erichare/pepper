"use client";

import { useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { scaleLinear, scalePoint } from "d3-scale";
import { area, curveBasis, stack } from "d3-shape";
import type { SeriesPoint } from "d3-shape";
import { Section } from "@/components/Section";
import { analysis, timeline } from "@/lib/data";
import { formatNumber, monthLabel } from "@/lib/format";

/* ── chart geometry (viewBox units) ─────────────────────────────── */

const VB_W = 900;
const VB_H = 380;
const MARGIN = { top: 42, right: 14, bottom: 30, left: 46 } as const;
const AXIS_Y = VB_H - MARGIN.bottom;

/* ── series colors ───────────────────────────────────────────────── */

const FIXED_COLORS: Record<string, string> = {
  Chipotle: "var(--chile)",
  tacobell: "var(--corn)",
  subway: "var(--guac)",
  jerseymikes: "var(--crema)",
  wendys: "var(--carnitas)",
  other: "color-mix(in srgb, var(--ink) 35%, transparent)",
};

const CYCLE_COLORS = [
  "var(--carnitas)",
  "var(--cilantro)",
  "var(--kraft-deep)",
  "var(--foil-b)",
];

type MonthRow = Record<string, number>;

interface ChartModel {
  months: string[];
  subs: string[];
  colors: Record<string, string>;
  areaPaths: { sub: string; d: string }[];
  totals: number[];
  maxTotal: number;
  peakIndex: number;
  step: number;
  xAt: (index: number) => number;
  yTicks: number[];
  yAt: (value: number) => number;
  yearTicks: { index: number; year: string }[];
}

/** r/Chipotle at the base of the stack, "other" always on top. */
function orderSubreddits(subs: readonly string[]): string[] {
  const middle = subs.filter((s) => s !== "Chipotle" && s !== "other");
  return ["Chipotle", ...middle, "other"].filter((s) => subs.includes(s));
}

function buildColorMap(subs: readonly string[]): Record<string, string> {
  const cycled = subs.filter((s) => !FIXED_COLORS[s]);
  return Object.fromEntries(
    subs.map((s) => [
      s,
      FIXED_COLORS[s] ?? CYCLE_COLORS[cycled.indexOf(s) % CYCLE_COLORS.length],
    ]),
  );
}

function buildModel(): ChartModel {
  const months = timeline.months;
  const subs = orderSubreddits(timeline.subreddits);
  const colors = buildColorMap(subs);
  const rows: MonthRow[] = months.map((_, i) =>
    Object.fromEntries(subs.map((s) => [s, timeline.series[s]?.[i] ?? 0])),
  );
  const totals = rows.map((row) => subs.reduce((sum, s) => sum + row[s], 0));
  const maxTotal = totals.length > 0 ? Math.max(...totals) : 1;
  const peakIndex = Math.max(0, totals.indexOf(maxTotal));

  const x = scalePoint<string>()
    .domain(months)
    .range([MARGIN.left, VB_W - MARGIN.right]);
  const y = scaleLinear()
    .domain([0, maxTotal * 1.06])
    .range([AXIS_Y, MARGIN.top]);

  const layers = stack<MonthRow>().keys(subs)(rows);
  const areaGen = area<SeriesPoint<MonthRow>>()
    .x((_, i) => x(months[i]) ?? 0)
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(curveBasis);

  return {
    months,
    subs,
    colors,
    areaPaths: layers.map((layer) => ({ sub: String(layer.key), d: areaGen(layer) ?? "" })),
    totals,
    maxTotal,
    peakIndex,
    step: x.step(),
    xAt: (index: number) => x(months[index]) ?? MARGIN.left,
    yTicks: y.ticks(4).filter((t) => t > 0),
    yAt: (value: number) => y(value),
    yearTicks: months
      .map((m, index) => ({ index, year: m.slice(0, 4) }))
      .filter(({ index }) => months[index].endsWith("-01")),
  };
}

const MODEL = buildModel();
const GAP = analysis.stats.activity_gaps[0] ?? null;
const GAP_START = GAP ? MODEL.months.indexOf(GAP.from.slice(0, 7)) : -1;
const GAP_END = GAP ? MODEL.months.indexOf(GAP.to.slice(0, 7)) : -1;

interface TooltipRow {
  label: string;
  count: number;
  color: string;
}

/** Top 4 subreddits that month plus an aggregated "other" row. */
function tooltipRows(index: number): TooltipRow[] {
  const ranked = MODEL.subs
    .filter((s) => s !== "other")
    .map((s) => ({
      label: s,
      count: timeline.series[s]?.[index] ?? 0,
      color: MODEL.colors[s],
    }))
    .sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, 4).filter((row) => row.count > 0);
  const rest =
    ranked.slice(4).reduce((sum, row) => sum + row.count, 0) +
    (timeline.series.other?.[index] ?? 0);
  return rest > 0
    ? [...top, { label: "other", count: rest, color: MODEL.colors.other }]
    : top;
}

/* ── sub-pieces ──────────────────────────────────────────────────── */

function YGrid() {
  return (
    <g aria-hidden="true">
      {MODEL.yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={MARGIN.left}
            x2={VB_W - MARGIN.right}
            y1={MODEL.yAt(tick)}
            y2={MODEL.yAt(tick)}
            stroke="var(--ink)"
            strokeOpacity={0.12}
          />
          <text
            x={MARGIN.left - 6}
            y={MODEL.yAt(tick) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--ink)"
            fillOpacity={0.55}
            className="tnum font-mono"
          >
            {formatNumber(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

function XAxis() {
  return (
    <g aria-hidden="true">
      <line
        x1={MARGIN.left}
        x2={VB_W - MARGIN.right}
        y1={AXIS_Y}
        y2={AXIS_Y}
        stroke="var(--ink)"
        strokeOpacity={0.35}
      />
      {MODEL.yearTicks.map(({ index, year }) => (
        <g key={year} transform={`translate(${MODEL.xAt(index)}, ${AXIS_Y})`}>
          <line y2={5} stroke="var(--ink)" strokeOpacity={0.35} />
          <text
            y={17}
            textAnchor="middle"
            fontSize={10}
            fill="var(--ink)"
            fillOpacity={0.6}
            className="tnum font-mono"
          >
            {year}
          </text>
        </g>
      ))}
    </g>
  );
}

interface TableTentProps {
  cx: number;
  label: string;
}

/** Little kraft table-tent card pinned to the x-axis. */
function TableTent({ cx, label }: TableTentProps) {
  const w = label.length * 6.2 + 18;
  const clamped = Math.min(
    VB_W - MARGIN.right - w / 2,
    Math.max(MARGIN.left + w / 2, cx),
  );
  return (
    <g transform={`translate(${clamped}, ${AXIS_Y})`} aria-hidden="true">
      <rect
        x={-w / 2 + 6}
        y={-27.5}
        width={w - 12}
        height={7}
        rx={1}
        transform="rotate(-2)"
        fill="var(--kraft-deep)"
        opacity={0.85}
      />
      <rect
        x={-w / 2}
        y={-23}
        width={w}
        height={21}
        rx={2}
        fill="var(--kraft)"
        stroke="var(--kraft-deep)"
      />
      <text
        y={-9}
        textAnchor="middle"
        fontSize={10}
        fill="var(--ink)"
        letterSpacing="0.05em"
        className="font-mono"
      >
        {label}
      </text>
    </g>
  );
}

function Annotations() {
  return (
    <g>
      {GAP && GAP_START >= 0 && GAP_END >= 0 && (
        <g>
          <line
            x1={MODEL.xAt(GAP_START)}
            x2={MODEL.xAt(GAP_END)}
            y1={AXIS_Y - 3}
            y2={AXIS_Y - 3}
            stroke="var(--ink)"
            strokeOpacity={0.5}
            strokeDasharray="2 4"
            aria-hidden="true"
          />
          <TableTent
            cx={(MODEL.xAt(GAP_START) + MODEL.xAt(GAP_END)) / 2}
            label={`THE ${Math.round(GAP.days)}-DAY VANISHING`}
          />
        </g>
      )}
      <TableTent
        cx={MODEL.xAt(MODEL.peakIndex)}
        label={`PEAK: ${formatNumber(MODEL.maxTotal)} ITEMS`}
      />
    </g>
  );
}

interface ScrubRuleProps {
  index: number;
}

/** Vertical rule with a serving-spoon finial riding its top. */
function ScrubRule({ index }: ScrubRuleProps) {
  const sx = MODEL.xAt(index);
  return (
    <g aria-hidden="true">
      <line
        x1={sx}
        x2={sx}
        y1={MARGIN.top - 4}
        y2={AXIS_Y}
        stroke="var(--ink)"
        strokeOpacity={0.55}
        strokeDasharray="3 3"
      />
      <g transform={`translate(${sx}, ${MARGIN.top - 6}) rotate(6)`}>
        <line
          y1={-17}
          y2={-8}
          stroke="var(--foil-b)"
          strokeWidth={2.6}
          strokeLinecap="round"
        />
        <ellipse
          cy={-3}
          rx={4.6}
          ry={5.6}
          fill="var(--foil-a)"
          stroke="var(--foil-b)"
          strokeWidth={1.2}
        />
      </g>
    </g>
  );
}

interface ScrubTooltipProps {
  index: number;
}

function ScrubTooltip({ index }: ScrubTooltipProps) {
  const flip = index / Math.max(1, MODEL.months.length - 1) > 0.55;
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 w-44 rounded border border-kraft-deep bg-kraft px-3 py-2 font-mono text-[11px] text-ink shadow-md"
      style={{
        left: `${(MODEL.xAt(index) / VB_W) * 100}%`,
        transform: flip ? "translateX(calc(-100% - 14px))" : "translateX(14px)",
      }}
      aria-hidden="true"
    >
      <p className="flex items-baseline justify-between gap-3 border-b border-kraft-deep/60 pb-1">
        <span className="font-bold uppercase">{monthLabel(MODEL.months[index])}</span>
        <span className="tnum">{formatNumber(MODEL.totals[index])}</span>
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {tooltipRows(index).map((row) => (
          <li key={row.label} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full border border-ink/20"
              style={{ background: row.color }}
            />
            <span className="truncate">
              {row.label === "other" ? "other" : `r/${row.label}`}
            </span>
            <span className="tnum ml-auto pl-2">{formatNumber(row.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SrTable() {
  return (
    <table className="sr-only">
      <caption>Archived items per month across all subreddits</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col">Items</th>
        </tr>
      </thead>
      <tbody>
        {MODEL.months.map((month, i) => (
          <tr key={month}>
            <th scope="row">{monthLabel(month)}</th>
            <td>{formatNumber(MODEL.totals[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── interactive chart ───────────────────────────────────────────── */

function TimelineViz() {
  const reduceMotion = useReducedMotion();
  const [scrub, setScrub] = useState<number | null>(null);
  const lastIndex = MODEL.months.length - 1;

  const indexFromPointer = (event: PointerEvent<SVGSVGElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = ((event.clientX - rect.left) / rect.width) * VB_W;
    const raw = Math.round((sx - MARGIN.left) / MODEL.step);
    return Math.min(lastIndex, Math.max(0, raw));
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    const current = scrub ?? MODEL.peakIndex;
    const next: Record<string, number | null> = {
      ArrowLeft: Math.max(0, current - 1),
      ArrowRight: Math.min(lastIndex, current + 1),
      Home: 0,
      End: lastIndex,
      Escape: null,
    };
    if (event.key in next) {
      event.preventDefault();
      setScrub(next[event.key]);
    }
  };

  const ariaLabel =
    `Stacked area chart of monthly Reddit activity from ` +
    `${monthLabel(MODEL.months[0])} to ${monthLabel(MODEL.months[lastIndex])}, ` +
    `layered by subreddit with r/Chipotle at the base. Peak month: ` +
    `${monthLabel(MODEL.months[MODEL.peakIndex])} with ${formatNumber(MODEL.maxTotal)} items. ` +
    `Use left and right arrow keys to step through months.`;

  return (
    <div className="relative">
      <motion.div
        initial={reduceMotion ? false : { clipPath: "inset(0 100% 0 0)" }}
        whileInView={reduceMotion ? undefined : { clipPath: "inset(0 0% 0 0)" }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 1.1, ease: [0.33, 1, 0.68, 1] }}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-auto w-full cursor-crosshair touch-pan-y select-none"
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onPointerMove={(e) => setScrub(indexFromPointer(e))}
          onPointerDown={(e) => setScrub(indexFromPointer(e))}
          onPointerLeave={() => setScrub(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setScrub(null)}
        >
          <YGrid />
          {MODEL.areaPaths.map(({ sub, d }) => (
            <path
              key={sub}
              d={d}
              fill={MODEL.colors[sub]}
              stroke={sub === "jerseymikes" ? "var(--kraft-deep)" : undefined}
              strokeWidth={sub === "jerseymikes" ? 0.8 : undefined}
            />
          ))}
          <XAxis />
          <Annotations />
          {scrub !== null && <ScrubRule index={scrub} />}
        </svg>
      </motion.div>
      {scrub !== null && <ScrubTooltip index={scrub} />}
      <div
        className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[11px] text-ink/70"
        aria-hidden="true"
      >
        {MODEL.subs.map((sub) => (
          <span key={sub} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full border border-ink/20"
              style={{ background: MODEL.colors[sub] }}
            />
            {sub === "other" ? "other" : `r/${sub}`}
          </span>
        ))}
      </div>
      <SrTable />
    </div>
  );
}

/* ── section ─────────────────────────────────────────────────────── */

export function TimelineChart() {
  return (
    <Section
      id="timeline"
      index="№ 03"
      kicker="THE SHIFT LOG"
      title="Six Years on the Line"
      subtitle="Monthly activity, stacked by restaurant."
    >
      <TimelineViz />
    </Section>
  );
}
