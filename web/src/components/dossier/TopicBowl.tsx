"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Section } from "@/components/Section";
import { analysis } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import type { TopicSummary } from "@/lib/types";

/* ── data (module scope: analysis.json is a static import) ────── */

interface YearCount {
  readonly year: number;
  readonly count: number;
}

const topics = analysis.topics.topics;
const topicById = new Map<number, TopicSummary>(topics.map((t) => [t.topic, t]));
const totalSize = topics.reduce((sum, t) => sum + t.size, 0);

const years: readonly number[] = [...new Set(analysis.topics.over_time.map((o) => o.year))].sort(
  (a, b) => a - b,
);

const yearSeries = new Map<number, readonly YearCount[]>(
  topics.map((t) => [
    t.topic,
    years.map((year) => ({
      year,
      count:
        analysis.topics.over_time.find((o) => o.topic === t.topic && o.year === year)?.count ?? 0,
    })),
  ]),
);

function sizeOf(id: number): number {
  return topicById.get(id)?.size ?? 0;
}

function shareOf(id: number): string {
  return totalSize > 0 ? `${((sizeOf(id) / totalSize) * 100).toFixed(1)}%` : "0%";
}

/* ── bowl geometry ─────────────────────────────────────────────
 * Bowl center (380, 310) in a 760×630 viewBox. Topping blobs are
 * hand-authored in unit space (radius ≈ 1) and placed with a static
 * translate/rotate/scale so that blob area ∝ topic size. The base
 * (topic 0) is authored at full size; its visible remainder after
 * the toppings land on it is roughly its share of the bowl.
 */

const BOWL_CX = 380;
const BOWL_CY = 310;
const BASE_R = 200;
const LIFT_SHADOW = "drop-shadow(0 6px 12px rgba(43, 27, 18, 0.35))";

function scaledRadius(id: number): number {
  return totalSize > 0 ? BASE_R * Math.sqrt(sizeOf(id) / totalSize) : 0;
}

const BLOB_SCOOP =
  "M 0 -1.04 C 0.5 -1.12 0.98 -0.8 1.06 -0.28 C 1.13 0.2 0.86 0.68 0.4 0.94 C -0.06 1.19 -0.62 1.05 -0.92 0.66 C -1.2 0.28 -1.12 -0.3 -0.8 -0.68 C -0.52 -1 -0.5 -0.96 0 -1.04 Z";
const BLOB_DOLLOP =
  "M 0.06 -1.08 C 0.58 -1.04 1.02 -0.66 1.04 -0.14 C 1.06 0.34 0.72 0.7 0.3 0.92 C -0.14 1.14 -0.66 1.08 -0.94 0.72 C -1.24 0.34 -1.14 -0.24 -0.82 -0.64 C -0.52 -1.02 -0.44 -1.12 0.06 -1.08 Z";
const BLOB_SPLAT =
  "M -0.02 -1.12 C 0.5 -1.18 0.9 -0.86 1.04 -0.36 C 1.18 0.12 1 0.6 0.56 0.86 C 0.12 1.12 -0.46 1.14 -0.84 0.82 C -1.2 0.5 -1.22 -0.06 -1 -0.5 C -0.78 -0.94 -0.54 -1.06 -0.02 -1.12 Z";
const BLOB_SMEAR =
  "M -1.4 -0.18 C -1.06 -0.52 -0.42 -0.72 0.3 -0.66 C 0.96 -0.6 1.44 -0.28 1.42 0.08 C 1.4 0.44 0.86 0.68 0.14 0.7 C -0.56 0.72 -1.28 0.6 -1.5 0.28 C -1.62 0.1 -1.6 0.02 -1.4 -0.18 Z";
const BLOB_BALL =
  "M 0 -1 C 0.55 -1 1 -0.55 1 0 C 1 0.55 0.55 1 0 1 C -0.55 1 -1 0.55 -1 0 C -1 -0.55 -0.55 -1 0 -1 Z";
const BASE_PATH =
  "M 380 112 C 490 108 552 180 566 288 C 580 390 520 480 412 502 C 310 522 210 470 186 368 C 162 270 222 160 320 122 C 340 114 360 113 380 112 Z";

interface IngredientConfig {
  readonly id: number;
  /** Straight-faced menu name, used in the tray + aria labels. */
  readonly title: string;
  /** Uppercase label lines around the bowl. */
  readonly labelLines: readonly string[];
  readonly note?: string;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly path: string;
  readonly base: boolean;
  readonly cx: number;
  readonly cy: number;
  readonly rotate: number;
  readonly speckled: boolean;
  readonly liftScale: number;
  readonly labelX: number;
  readonly labelY: number;
  readonly anchor: "start" | "middle" | "end";
  readonly leader: readonly [number, number, number, number];
}

const INGREDIENTS: readonly IngredientConfig[] = [
  {
    id: 0,
    title: "Everything else he says",
    labelLines: ["EVERYTHING ELSE HE SAYS"],
    fill: "var(--kraft)",
    stroke: "var(--kraft-deep)",
    strokeWidth: 2,
    path: BASE_PATH,
    base: true,
    cx: BOWL_CX,
    cy: BOWL_CY,
    rotate: 0,
    speckled: false,
    liftScale: 1.02,
    labelX: 380,
    labelY: 600,
    anchor: "middle",
    leader: [380, 590, 380, 550],
  },
  {
    id: 1,
    title: "White rice",
    labelLines: ["WHITE RICE"],
    fill: "var(--crema)",
    stroke: "var(--kraft-deep)",
    strokeWidth: 1.5,
    path: BLOB_DOLLOP,
    base: false,
    cx: 290,
    cy: 205,
    rotate: -30,
    speckled: true,
    liftScale: 1.04,
    labelX: 118,
    labelY: 90,
    anchor: "end",
    leader: [126, 94, 246, 174],
  },
  {
    id: 2,
    title: "Hot salsa",
    labelLines: ["HOT SALSA"],
    fill: "var(--chile)",
    stroke: "var(--chile-deep)",
    strokeWidth: 1.5,
    path: BLOB_SPLAT,
    base: false,
    cx: 240,
    cy: 318,
    rotate: 18,
    speckled: false,
    liftScale: 1.04,
    labelX: 118,
    labelY: 324,
    anchor: "end",
    leader: [126, 328, 184, 321],
  },
  {
    id: 3,
    title: "The protein: skimp discourse",
    labelLines: ["THE PROTEIN:", "SKIMP DISCOURSE"],
    fill: "var(--carnitas)",
    stroke: "color-mix(in oklab, var(--carnitas) 65%, var(--board))",
    strokeWidth: 1.5,
    path: BLOB_SCOOP,
    base: false,
    cx: 480,
    cy: 360,
    rotate: 140,
    speckled: false,
    liftScale: 1.04,
    labelX: 642,
    labelY: 350,
    anchor: "start",
    leader: [636, 358, 547, 360],
  },
  {
    id: 4,
    title: "Food shaming",
    labelLines: ["FOOD SHAMING"],
    fill: "var(--board)",
    stroke: "var(--board-soft)",
    strokeWidth: 1.5,
    path: BLOB_SMEAR,
    base: false,
    cx: 420,
    cy: 460,
    rotate: -8,
    speckled: false,
    liftScale: 1.04,
    labelX: 628,
    labelY: 536,
    anchor: "start",
    leader: [622, 540, 462, 473],
  },
  {
    id: 5,
    title: "The wealth bit",
    labelLines: ["THE WEALTH BIT"],
    note: "extra, obviously",
    fill: "var(--guac)",
    stroke: "var(--cilantro)",
    strokeWidth: 1.5,
    path: BLOB_DOLLOP,
    base: false,
    cx: 320,
    cy: 420,
    rotate: 95,
    speckled: false,
    liftScale: 1.04,
    labelX: 142,
    labelY: 500,
    anchor: "end",
    leader: [148, 508, 270, 447],
  },
  {
    id: 6,
    title: "The Subway intruder",
    labelLines: ["THE SUBWAY INTRUDER"],
    fill: "var(--carnitas)",
    stroke: "var(--board)",
    strokeWidth: 2.5,
    path: BLOB_BALL,
    base: false,
    cx: 375,
    cy: 155,
    rotate: 0,
    speckled: false,
    liftScale: 1.04,
    labelX: 375,
    labelY: 26,
    anchor: "middle",
    leader: [375, 46, 375, 112],
  },
  {
    id: 7,
    title: "Grilled cheese / Taco Bell",
    labelLines: ["GRILLED CHEESE /", "TACO BELL"],
    fill: "var(--corn)",
    stroke: "var(--gold)",
    strokeWidth: 1.5,
    path: BLOB_SCOOP,
    base: false,
    cx: 465,
    cy: 225,
    rotate: -12,
    speckled: false,
    liftScale: 1.04,
    labelX: 642,
    labelY: 92,
    anchor: "start",
    leader: [636, 100, 520, 188],
  },
];

/** Entrance stagger: biggest ingredient drops in first. */
const entranceOrder = new Map<number, number>(
  [...INGREDIENTS].sort((a, b) => sizeOf(b.id) - sizeOf(a.id)).map((cfg, i) => [cfg.id, i]),
);

/* ── small pieces ──────────────────────────────────────────────── */

const RICE_GRAINS: readonly (readonly [number, number, number])[] = [
  [-0.42, -0.28, 20],
  [0.12, -0.5, -15],
  [0.48, -0.15, 40],
  [-0.12, 0.02, -30],
  [0.3, 0.32, 10],
  [-0.5, 0.28, 55],
  [0.05, 0.58, -20],
  [-0.22, -0.62, 35],
  [0.58, 0.28, -40],
  [-0.6, -0.05, 15],
];

function RiceSpeckle(): ReactElement {
  return (
    <g pointerEvents="none" fill="var(--kraft-deep)" opacity={0.55} aria-hidden="true">
      {RICE_GRAINS.map(([cx, cy, angle]) => (
        <ellipse
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          rx={0.1}
          ry={0.04}
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}
    </g>
  );
}

interface IngredientBlobProps {
  cfg: IngredientConfig;
  dimmed: boolean;
  lifted: boolean;
  inView: boolean;
  reduce: boolean;
  onActivate: (id: number | null) => void;
  onSelect: (id: number) => void;
}

function IngredientBlob({
  cfg,
  dimmed,
  lifted,
  inView,
  reduce,
  onActivate,
  onSelect,
}: IngredientBlobProps): ReactElement {
  const order = entranceOrder.get(cfg.id) ?? 0;
  const radius = scaledRadius(cfg.id);
  const placement = cfg.base ? undefined : `translate(${cfg.cx} ${cfg.cy})`;
  const unitTransform = cfg.base ? undefined : `rotate(${cfg.rotate}) scale(${radius.toFixed(2)})`;

  const handleKeyDown = (event: ReactKeyboardEvent<SVGPathElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(cfg.id);
    }
  };

  return (
    <g
      transform={placement}
      className="transition-[filter] duration-200"
      style={{ filter: lifted ? LIFT_SHADOW : undefined }}
    >
      <motion.g
        initial={reduce ? false : { opacity: 0, y: -40 }}
        animate={reduce || inView ? { opacity: 1, y: 0 } : { opacity: 0, y: -40 }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 220, damping: 24, delay: 0.07 * order }
        }
      >
        <g transform={unitTransform}>
          <motion.g
            initial={false}
            animate={{ opacity: dimmed ? 0.5 : 1, scale: lifted ? cfg.liftScale : 1 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 26 }}
          >
            <motion.path
              d={cfg.path}
              fill={cfg.fill}
              stroke={cfg.stroke}
              strokeWidth={cfg.strokeWidth}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              aria-haspopup="dialog"
              aria-label={`${cfg.title}: ${formatNumber(sizeOf(cfg.id))} items`}
              onHoverStart={() => onActivate(cfg.id)}
              onHoverEnd={() => onActivate(null)}
              onFocus={() => onActivate(cfg.id)}
              onBlur={() => onActivate(null)}
              onClick={() => onSelect(cfg.id)}
              onKeyDown={handleKeyDown}
            />
            {cfg.speckled && <RiceSpeckle />}
          </motion.g>
        </g>
      </motion.g>
    </g>
  );
}

interface IngredientLabelProps {
  cfg: IngredientConfig;
  dimmed: boolean;
}

function IngredientLabel({ cfg, dimmed }: IngredientLabelProps): ReactElement {
  const [x1, y1, x2, y2] = cfg.leader;
  return (
    <g
      pointerEvents="none"
      aria-hidden="true"
      className="transition-opacity duration-200"
      opacity={dimmed ? 0.35 : 1}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="var(--ink)"
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <text
        x={cfg.labelX}
        y={cfg.labelY}
        textAnchor={cfg.anchor}
        fill="var(--ink)"
        className="font-mono text-[10px] uppercase tracking-[0.08em]"
      >
        {cfg.labelLines.map((line, i) => (
          <tspan
            key={line}
            x={cfg.labelX}
            dy={i === 0 ? 0 : 13}
            fontWeight={600}
            opacity={0.85}
          >
            {line}
          </tspan>
        ))}
        {cfg.note && (
          <tspan x={cfg.labelX} dy={13} opacity={0.6} className="normal-case">
            {cfg.note}
          </tspan>
        )}
        <tspan x={cfg.labelX} dy={13} opacity={0.55} className="tnum">
          {formatNumber(sizeOf(cfg.id))} ITEMS
        </tspan>
      </text>
    </g>
  );
}

interface SparklineProps {
  series: readonly YearCount[];
  title: string;
}

function Sparkline({ series, title }: SparklineProps): ReactElement {
  const width = 280;
  const height = 64;
  const pad = 8;
  const max = Math.max(1, ...series.map((p) => p.count));
  const step = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
  const pts = series.map((p, i) => ({
    x: pad + i * step,
    y: height - pad - (p.count / max) * (height - pad * 2),
  }));
  const points = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const label = `${title}, items per year: ${series
    .map((p) => `${p.year}: ${formatNumber(p.count)}`)
    .join("; ")}`;

  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block h-auto w-full">
        <polyline
          points={points}
          fill="none"
          stroke="var(--chile)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {last && <circle cx={last.x} cy={last.y} r={3} fill="var(--chile)" />}
      </svg>
      <div className="tnum mt-1 flex justify-between font-mono text-[10px] text-ink/60">
        <span>{series[0]?.year ?? ""}</span>
        <span>peak {formatNumber(Math.max(0, ...series.map((p) => p.count)))}</span>
        <span>{series[series.length - 1]?.year ?? ""}</span>
      </div>
    </div>
  );
}

/* ── side tray ─────────────────────────────────────────────────── */

interface SideTrayProps {
  cfg: IngredientConfig;
  topic: TopicSummary;
  series: readonly YearCount[];
  isDesktop: boolean;
  reduce: boolean;
  onClose: () => void;
}

function SideTray({ cfg, topic, series, isDesktop, reduce, onClose }: SideTrayProps): ReactElement {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <motion.aside
      role="dialog"
      aria-label={`On the side: ${cfg.title}`}
      initial={reduce ? { opacity: 0 } : isDesktop ? { x: "100%" } : { y: "100%" }}
      animate={reduce ? { opacity: 1 } : { x: 0, y: 0 }}
      exit={reduce ? { opacity: 0 } : isDesktop ? { x: "100%" } : { y: "100%" }}
      transition={{ type: "tween", duration: reduce ? 0.1 : 0.34, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-x-0 bottom-0 z-[70] max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-kraft-deep bg-crema p-6 text-ink shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[min(420px,92vw)] sm:rounded-none sm:border-l sm:border-t-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="kicker">ON THE SIDE</p>
          <h3 className="display mt-2 text-2xl">{cfg.title}</h3>
          {cfg.note && <p className="mt-1 font-mono text-xs text-ink/60">{cfg.note}</p>}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close tray"
          className="rounded border border-kraft-deep/60 px-2.5 py-1 font-mono text-sm text-ink/80 hover:bg-masa"
        >
          ✕
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 font-mono">
        <div className="rounded bg-masa p-3">
          <dt className="text-[10px] uppercase tracking-[0.15em] text-ink/60">Items</dt>
          <dd className="tnum mt-1 text-xl font-semibold">{formatNumber(topic.size)}</dd>
        </div>
        <div className="rounded bg-masa p-3">
          <dt className="text-[10px] uppercase tracking-[0.15em] text-ink/60">Share of bowl</dt>
          <dd className="tnum mt-1 text-xl font-semibold">{shareOf(topic.topic)}</dd>
        </div>
      </dl>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/60">
        Ingredient tags
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {topic.terms.map((term) => (
          <li
            key={term}
            className="rounded-full border border-kraft-deep/70 bg-masa px-2.5 py-1 font-mono text-[11px] text-ink/80"
          >
            {term}
          </li>
        ))}
      </ul>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/60">
        Items per year
      </p>
      <Sparkline series={series} title={cfg.title} />
    </motion.aside>
  );
}

/* ── main section ──────────────────────────────────────────────── */

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = (): void => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

export function TopicBowl(): ReactElement {
  const reduce = useReducedMotion() ?? false;
  const isDesktop = useIsDesktop();
  const figureRef = useRef<HTMLDivElement>(null);
  const inView = useInView(figureRef, { once: true, amount: 0.25 });
  const [active, setActive] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // The side tray renders through createPortal to document.body, which only
    // exists after client mount; gating on it avoids an SSR/hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selected === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const focusTopic = active ?? selected;
  const selectedCfg = selected !== null ? (INGREDIENTS.find((c) => c.id === selected) ?? null) : null;
  const selectedTopic = selected !== null ? (topicById.get(selected) ?? null) : null;

  return (
    <Section
      id="bowl"
      index="№ 05"
      kicker="INGREDIENTS"
      title="The Bowl"
      subtitle="Six years of comments, sorted into eight ingredients. Portion sizes to scale."
    >
      <div ref={figureRef} className="relative">
        <div className="mx-auto w-full max-w-[680px]">
          <svg
            viewBox="0 0 760 630"
            role="group"
            aria-label={`Overhead bowl diagram of ${formatNumber(totalSize)} comments sorted into eight topics; portion sizes proportional to item counts.`}
            className="block h-auto w-full"
          >
            <circle
              cx={BOWL_CX}
              cy={BOWL_CY}
              r={235}
              fill="none"
              stroke="var(--kraft-deep)"
              strokeWidth={4}
            />
            <circle
              cx={BOWL_CX}
              cy={BOWL_CY}
              r={214}
              fill="color-mix(in oklab, var(--kraft) 28%, var(--masa))"
              stroke="var(--board)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
            />
            {INGREDIENTS.map((cfg) => (
              <IngredientBlob
                key={cfg.id}
                cfg={cfg}
                dimmed={focusTopic !== null && focusTopic !== cfg.id}
                lifted={focusTopic === cfg.id}
                inView={inView}
                reduce={reduce}
                onActivate={setActive}
                onSelect={setSelected}
              />
            ))}
            {INGREDIENTS.map((cfg) => (
              <IngredientLabel
                key={cfg.id}
                cfg={cfg}
                dimmed={focusTopic !== null && focusTopic !== cfg.id}
              />
            ))}
          </svg>
        </div>

        <table className="sr-only">
          <caption>Comment topics by item count</caption>
          <thead>
            <tr>
              <th scope="col">Ingredient</th>
              <th scope="col">Topic terms</th>
              <th scope="col">Items</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {INGREDIENTS.map((cfg) => (
              <tr key={cfg.id}>
                <th scope="row">{cfg.title}</th>
                <td>{topicById.get(cfg.id)?.terms.join(", ") ?? ""}</td>
                <td>{formatNumber(sizeOf(cfg.id))}</td>
                <td>{shareOf(cfg.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {selectedCfg && selectedTopic && (
              <SideTray
                key={selectedCfg.id}
                cfg={selectedCfg}
                topic={selectedTopic}
                series={yearSeries.get(selectedCfg.id) ?? []}
                isDesktop={isDesktop}
                reduce={reduce}
                onClose={() => setSelected(null)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </Section>
  );
}
