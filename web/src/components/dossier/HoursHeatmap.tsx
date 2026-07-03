"use client";

import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Section } from "@/components/Section";
import { analysis } from "@/lib/data";
import { formatNumber } from "@/lib/format";

/* ── data (module scope: analysis.json is a static import) ────── */

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_PLURALS = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
] as const;
const HOURS: readonly number[] = Array.from({ length: 24 }, (_, h) => h);
const SLOT_TOTAL = 7 * 24;

function hour12(hour: number): string {
  const base = hour % 12 === 0 ? 12 : hour % 12;
  return `${base}${hour < 12 ? "am" : "pm"}`;
}

const countByKey = new Map<string, number>(
  analysis.stats.heatmap
    .filter((c) => c.weekday >= 1 && c.weekday <= 7 && c.hour >= 0 && c.hour <= 23)
    .map((c) => [`${c.weekday}-${c.hour}`, c.count]),
);

/** grid[dayIndex 0=Mon..6=Sun][hour 0..23] → post count. */
const grid: readonly (readonly number[])[] = Array.from({ length: 7 }, (_, d) =>
  HOURS.map((h) => countByKey.get(`${d + 1}-${h}`) ?? 0),
);

const maxCount = Math.max(1, ...grid.flat());

const peak = grid.reduce(
  (best, row, d) => row.reduce((b, count, h) => (count > b.count ? { d, h, count } : b), best),
  { d: 0, h: 0, count: -1 },
);

const hourTotals: readonly number[] = HOURS.map((h) => grid.reduce((sum, row) => sum + row[h], 0));
const dayTotals: readonly number[] = grid.map((row) => row.reduce((sum, c) => sum + c, 0));

const busiestHour = hourTotals.reduce(
  (best, total, h) => (total > best.total ? { h, total } : best),
  { h: 0, total: -1 },
);
const busiestDay = dayTotals.reduce(
  (best, total, d) => (total > best.total ? { d, total } : best),
  { d: 0, total: -1 },
);

const coveredSlots = grid.flat().filter((count) => count > 0).length;
const coveragePct = Math.round((coveredSlots / SLOT_TOTAL) * 100);

/** board → chile → corn ramp; sqrt spreads the skewed counts. */
function cellColor(count: number): string {
  const t = Math.sqrt(count / maxCount);
  if (t < 0.55) {
    const pct = Math.round((t / 0.55) * 100);
    return `color-mix(in oklab, var(--chile) ${pct}%, var(--board-soft))`;
  }
  const pct = Math.round(((t - 0.55) / 0.45) * 100);
  return `color-mix(in oklab, var(--corn) ${pct}%, var(--chile))`;
}

function cellLabel(d: number, h: number, count: number): string {
  return `${DAY_PLURALS[d]} ${hour12(h)} — ${formatNumber(count)} posts`;
}

/* ── cell ──────────────────────────────────────────────────────── */

interface HeatCellProps {
  day: number;
  hour: number;
  count: number;
  isPeak: boolean;
  dimmed: boolean;
  isHovered: boolean;
  inView: boolean;
  reduce: boolean;
  onHover: (cell: { d: number; h: number } | null) => void;
}

function HeatCell({
  day,
  hour,
  count,
  isPeak,
  dimmed,
  isHovered,
  inView,
  reduce,
  onHover,
}: HeatCellProps): ReactElement {
  const label = cellLabel(day, hour, count);
  const tooltipPos =
    hour < 4 ? "left-0" : hour > 19 ? "right-0" : "left-1/2 -translate-x-1/2";
  const bgAnimate = reduce
    ? { opacity: 1 }
    : inView
      ? { opacity: [0, 1, 0.35, 1] }
      : { opacity: 0 };

  return (
    <div
      tabIndex={0}
      aria-label={label}
      onMouseEnter={() => onHover({ d: day, h: hour })}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover({ d: day, h: hour })}
      onBlur={() => onHover(null)}
      className={`relative aspect-square transition-opacity duration-150 ${isPeak ? "z-10" : ""}`}
      style={{ opacity: dimmed ? 0.35 : 1 }}
    >
      <motion.div
        aria-hidden="true"
        className={`absolute inset-0 rounded-[3px] ${isPeak ? "ring-1 ring-gold" : ""}`}
        style={{ backgroundColor: cellColor(count) }}
        initial={reduce ? false : { opacity: 0 }}
        animate={bgAnimate}
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 0.4, times: [0, 0.35, 0.65, 1], delay: hour * 0.008 }
        }
      />
      {isPeak && inView && !reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 rounded-[3px] border-2 border-gold"
          initial={{ opacity: 0.9, scale: 1 }}
          animate={{ opacity: 0, scale: 2.2 }}
          transition={{ delay: hour * 0.008 + 0.6, duration: 1.1, ease: "easeOut" }}
        />
      )}
      {isPeak && (
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-sm border border-gold/40 bg-board px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-[0.15em] text-gold">
          PEAK HOURS
        </span>
      )}
      {isHovered && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-full z-30 mb-1.5 whitespace-nowrap rounded-sm border border-kraft-deep/40 bg-crema px-2 py-1 font-mono text-[10px] text-ink shadow-lg ${tooltipPos}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/* ── stat plaque ───────────────────────────────────────────────── */

interface StatPlaqueProps {
  label: string;
  value: string;
  detail: string;
  featured?: boolean;
}

function StatPlaque({ label, value, detail, featured = false }: StatPlaqueProps): ReactElement {
  return (
    <div className="rounded bg-board-soft p-4 font-mono">
      <dt className="text-[10px] uppercase tracking-[0.15em] text-masa/60">{label}</dt>
      <dd
        className={`tnum mt-2 font-semibold ${
          featured ? "text-4xl text-gold sm:text-5xl" : "text-2xl text-masa sm:text-3xl"
        }`}
      >
        {value}
      </dd>
      <dd className="tnum mt-1 text-xs text-masa/60">{detail}</dd>
    </div>
  );
}

/* ── main section ──────────────────────────────────────────────── */

type Lane = { type: "row" | "col"; index: number } | null;

export function HoursHeatmap(): ReactElement {
  const reduce = useReducedMotion() ?? false;
  const gridRef = useRef<HTMLDivElement>(null);
  const inView = useInView(gridRef, { once: true, amount: 0.15 });
  const [hovered, setHovered] = useState<{ d: number; h: number } | null>(null);
  const [lane, setLane] = useState<Lane>(null);

  const isLaneDimmed = (d: number, h: number): boolean => {
    if (lane === null) return false;
    if (lane.type === "row") return lane.index !== d;
    return lane.index !== h;
  };

  return (
    <Section
      id="hours"
      index="№ 06"
      kicker="STORE HOURS"
      title="When Is He Posting?"
      subtitle="Answer: always. All times UTC."
      dark
    >
      <div ref={gridRef}>
        <div
          role="img"
          aria-label={`Posting heatmap, 7 weekdays by 24 UTC hours. Peak activity ${DAY_PLURALS[peak.d]} at ${hour12(peak.h)} with ${formatNumber(peak.count)} posts.`}
          className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-[3px] sm:gap-1"
        >
          <div aria-hidden="true" />
          {HOURS.map((h) => (
            <div
              key={`head-${h}`}
              aria-hidden="true"
              onMouseEnter={() => setLane({ type: "col", index: h })}
              onMouseLeave={() => setLane(null)}
              className="tnum flex cursor-default select-none items-end justify-center pb-1 font-mono text-[8px] text-masa/50 transition-opacity duration-150 sm:text-[9px]"
              style={{ opacity: lane?.type === "col" && lane.index !== h ? 0.4 : 1 }}
            >
              <span className={h % 3 === 0 ? "" : "hidden sm:inline"}>{h}</span>
            </div>
          ))}

          {grid.map((row, d) => (
            <div key={DAY_LABELS[d]} className="contents">
              <div
                aria-hidden="true"
                onMouseEnter={() => setLane({ type: "row", index: d })}
                onMouseLeave={() => setLane(null)}
                className="flex cursor-default select-none items-center justify-end pr-1.5 font-mono text-[9px] uppercase tracking-wider text-masa/60 transition-opacity duration-150 sm:pr-2 sm:text-[10px]"
                style={{ opacity: lane?.type === "row" && lane.index !== d ? 0.4 : 1 }}
              >
                {DAY_LABELS[d]}
              </div>
              {row.map((count, h) => (
                <HeatCell
                  key={`${d}-${h}`}
                  day={d}
                  hour={h}
                  count={count}
                  isPeak={d === peak.d && h === peak.h}
                  dimmed={isLaneDimmed(d, h)}
                  isHovered={hovered !== null && hovered.d === d && hovered.h === h}
                  inView={inView}
                  reduce={reduce}
                  onHover={setHovered}
                />
              ))}
            </div>
          ))}
        </div>

        <dl className="mt-10 grid gap-3 sm:grid-cols-3">
          <StatPlaque
            label="Busiest hour (UTC)"
            value={hour12(busiestHour.h)}
            detail={`${formatNumber(busiestHour.total)} posts in this hour-slot alone`}
          />
          <StatPlaque
            label="Busiest day"
            value={DAY_PLURALS[busiestDay.d]}
            detail={`${formatNumber(busiestDay.total)} posts across the archive`}
          />
          <StatPlaque
            label="Hour-slots ever posted in"
            value={`${coveragePct}%`}
            detail={`${coveredSlots} of ${SLOT_TOTAL} weekly hour-slots contain at least one post`}
            featured
          />
        </dl>

        <table className="sr-only">
          <caption>Posts by weekday and UTC hour</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {HOURS.map((h) => (
                <th key={h} scope="col">{`${h}:00`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={DAY_LABELS[d]}>
                <th scope="row">{DAY_PLURALS[d]}</th>
                {row.map((count, h) => (
                  <td key={h}>{count}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
