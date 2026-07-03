"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Section } from "@/components/Section";
import { analysis } from "@/lib/data";
import { formatNumber, seededRandom } from "@/lib/format";

/* ── layout constants ────────────────────────────────────────── */

const VIEW_W = 900;
const VIEW_H = 560;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const CENTER_ID = "__pepper__";
const MAX_NODES = 30;
const MIN_R = 6;
const MAX_R = 22;
const ORBIT_MIN = 80;
const ORBIT_SPAN = 162;
const DUST_COUNT = 80;
const DUST_RADIUS = 234;
const SETTLE_TICKS = 120;
const GOLDEN_ANGLE = 2.399963229728653;

/** Hand-drawn chili glyph paths (mirrors PepperGlyph.tsx, 24×24 space). */
const PEPPER_STEM = "M14.5 6.5c.3-1.8 1.6-3 3.5-3.2";
const PEPPER_BODY =
  "M14.5 6.5c4 .5 6 3.4 5.4 7-.7 4.4-5 7.8-10.4 7.2C4.9 20.2 2.5 17 3 13.5c.2-1.4 1.2-2.3 2.6-2.2 2.4.2 2.7 2.6 5 2.9 2 .2 3.5-1.3 3.7-3.4.1-1.6-.2-3-.3-4.3z";

/* ── types ───────────────────────────────────────────────────── */

interface OrbitNode extends SimulationNodeDatum {
  readonly id: string;
  readonly author: string;
  readonly replies: number;
  readonly subreddits: readonly string[];
  readonly r: number;
  readonly fill: string;
  readonly edgeWidth: number;
  readonly isSelf: boolean;
  readonly rank: number;
}

type OrbitLink = SimulationLinkDatum<OrbitNode>;

interface XY {
  readonly x: number;
  readonly y: number;
}

type PositionMap = Readonly<Record<string, XY>>;

interface DustDot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/* ── pure helpers ────────────────────────────────────────────── */

function subredditFill(subreddits: readonly string[]): string {
  const lower = subreddits.map((s) => s.toLowerCase());
  if (lower.includes("chipotle")) return "var(--chile)";
  if (lower.includes("tacobell")) return "var(--corn)";
  if (lower.includes("subway")) return "var(--guac)";
  return "var(--kraft-deep)";
}

/** More replies → lower rank → tighter orbit. */
function orbitDistance(rank: number, count: number): number {
  return ORBIT_MIN + (rank / Math.max(1, count - 1)) * ORBIT_SPAN;
}

function buildOrbitNodes(): OrbitNode[] {
  const top = analysis.graph.top_interlocutors.slice(0, MAX_NODES);
  const sorted = [...top].sort((a, b) => b.replies - a.replies);
  const roots = sorted.map((i) => Math.sqrt(i.replies));
  const minRoot = Math.min(...roots);
  const maxRoot = Math.max(...roots);
  const span = maxRoot - minRoot || 1;
  return sorted.map((entry, rank) => {
    const t = (Math.sqrt(entry.replies) - minRoot) / span;
    const distance = orbitDistance(rank, sorted.length);
    const angle = rank * GOLDEN_ANGLE;
    return {
      id: entry.author,
      author: entry.author,
      replies: entry.replies,
      subreddits: entry.subreddits,
      r: MIN_R + t * (MAX_R - MIN_R),
      fill: subredditFill(entry.subreddits),
      edgeWidth: 0.5 + t * 2.5,
      isSelf: entry.author === analysis.username,
      rank,
      x: CX + Math.cos(angle) * distance,
      y: CY + Math.sin(angle) * distance,
    };
  });
}

function buildCenterNode(): OrbitNode {
  return {
    id: CENTER_ID,
    author: analysis.username,
    replies: 0,
    subreddits: [],
    r: 34,
    fill: "var(--board-soft)",
    edgeWidth: 0,
    isSelf: false,
    rank: -1,
    x: CX,
    y: CY,
    fx: CX,
    fy: CY,
  };
}

/**
 * Round to 2 decimals. Math.sin/Math.cos are not guaranteed bit-identical
 * between the server's and the browser's V8, so trig-derived coordinates must
 * be rounded before they reach the DOM or SSR and hydration disagree.
 */
function px(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildDustRing(): readonly DustDot[] {
  const rand = seededRandom(42);
  const dots: DustDot[] = [];
  for (let i = 0; i < DUST_COUNT; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = DUST_RADIUS + rand() * 28;
    dots.push({
      x: px(CX + Math.cos(angle) * radius),
      y: px(CY + Math.sin(angle) * radius),
      r: px(0.8 + rand() * 1.4),
    });
  }
  return dots;
}

function snapshotPositions(nodes: readonly OrbitNode[]): PositionMap {
  const out: Record<string, XY> = {};
  for (const node of nodes) {
    out[node.id] = { x: px(node.x ?? CX), y: px(node.y ?? CY) };
  }
  return out;
}

function createSimulation(
  center: OrbitNode,
  nodes: OrbitNode[],
): Simulation<OrbitNode, OrbitLink> {
  const links: OrbitLink[] = nodes.map((n) => ({ source: CENTER_ID, target: n.id }));
  return forceSimulation<OrbitNode>([center, ...nodes])
    .force("charge", forceManyBody<OrbitNode>().strength(-80))
    .force(
      "link",
      forceLink<OrbitNode, OrbitLink>(links)
        .id((d) => d.id)
        .distance((link) =>
          typeof link.target === "object"
            ? orbitDistance(link.target.rank, nodes.length)
            : ORBIT_MIN + ORBIT_SPAN,
        )
        .strength(0.9),
    )
    .force("collide", forceCollide<OrbitNode>((d) => d.r + 4))
    .force("x", forceX<OrbitNode>(CX).strength(0.04))
    .force("y", forceY<OrbitNode>(CY).strength(0.07));
}

function subredditLabel(subs: readonly string[]): string {
  const shown = subs
    .slice(0, 3)
    .map((s) => `r/${s}`)
    .join(", ");
  return subs.length > 3 ? `${shown}…` : shown;
}

function nodeAriaLabel(node: OrbitNode): string {
  const base = `u/${node.author}, ${formatNumber(node.replies)} replies, shared subreddits: ${node.subreddits.join(", ")}`;
  return node.isSelf ? `${base}. His most frequent conversation partner: himself.` : base;
}

/* ── chart ───────────────────────────────────────────────────── */

function ConstellationChart() {
  const prefersReduced = useReducedMotion() === true;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<OrbitNode, OrbitLink> | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const inView = useInView(containerRef, { amount: 0.15 });

  const nodes = useMemo(() => buildOrbitNodes(), []);
  const center = useMemo(() => buildCenterNode(), []);
  const dust = useMemo(() => buildDustRing(), []);
  // Deterministic golden-angle layout for the first paint — identical on server
  // and client (d3-force's settle uses Math.random, so it must stay client-only
  // below, or SSR and hydration would disagree on every node position).
  const [positions, setPositions] = useState<PositionMap>(() => snapshotPositions(nodes));
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const sim = createSimulation(center, nodes);
    sim.stop();
    if (prefersReduced) {
      sim.tick(SETTLE_TICKS);
      // One-time client settle; must run here (not in render) to keep SSR stable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPositions(snapshotPositions(nodes));
      return () => {
        sim.stop();
      };
    }
    let tick = 0;
    sim.on("tick", () => {
      tick += 1;
      if (tick % 2 === 0) setPositions(snapshotPositions(nodes));
    });
    simRef.current = sim;
    return () => {
      simRef.current = null;
      sim.stop();
    };
  }, [center, nodes, prefersReduced]);

  // Pause the simulation whenever the chart scrolls out of view.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim || prefersReduced) return;
    if (inView) {
      sim.restart();
    } else {
      sim.stop();
    }
  }, [inView, prefersReduced]);

  const svgPoint = useCallback((clientX: number, clientY: number): XY => {
    const svg = svgRef.current;
    if (!svg) return { x: CX, y: CY };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW_W,
      y: ((clientY - rect.top) / rect.height) * VIEW_H,
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGGElement>, node: OrbitNode) => {
      if (prefersReduced) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragIdRef.current = node.id;
      const p = svgPoint(event.clientX, event.clientY);
      node.fx = p.x;
      node.fy = p.y;
      simRef.current?.alphaTarget(0.25).restart();
    },
    [prefersReduced, svgPoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGGElement>, node: OrbitNode) => {
      if (dragIdRef.current !== node.id) return;
      const p = svgPoint(event.clientX, event.clientY);
      node.fx = p.x;
      node.fy = p.y;
    },
    [svgPoint],
  );

  const handlePointerEnd = useCallback((node: OrbitNode) => {
    if (dragIdRef.current !== node.id) return;
    dragIdRef.current = null;
    node.fx = null;
    node.fy = null;
    simRef.current?.alphaTarget(0);
  }, []);

  const hovered = hoveredId ? (nodes.find((n) => n.id === hoveredId) ?? null) : null;
  const hoveredPos = hovered ? positions[hovered.id] : undefined;
  const selfNode = nodes.find((n) => n.isSelf) ?? null;
  const othersCount = Math.max(
    0,
    analysis.graph.metrics.distinct_interlocutors - nodes.length,
  );

  return (
    <div>
      <div ref={containerRef} className="relative">
        <div className="pointer-events-none mb-4 max-w-xs rounded border border-gold/30 bg-board-soft p-3 font-mono text-[11px] leading-relaxed sm:absolute sm:right-2 sm:top-2 sm:z-10 sm:mb-0">
          <p className="tracking-[0.12em] text-gold">
            HIS MOST FREQUENT CONVERSATION PARTNER: HIMSELF
          </p>
          <p className="mt-1 text-masa/70">
            u/{analysis.username} · {formatNumber(selfNode?.replies ?? 0)} replies to his own
            threads
          </p>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full"
          role="group"
          aria-label={`Reply constellation: u/${analysis.username} at the center, orbited by his ${nodes.length} most frequent reply partners. Node size reflects reply count.`}
        >
          <g aria-hidden="true">
            {dust.map((dot, i) => (
              <circle
                key={`dust-${i}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill="var(--masa)"
                fillOpacity={0.2}
              />
            ))}
          </g>

          <g aria-hidden="true">
            {nodes.map((node) => {
              const pos = positions[node.id] ?? { x: CX, y: CY };
              const active = hoveredId === node.id;
              return (
                <line
                  key={`edge-${node.id}`}
                  x1={CX}
                  y1={CY}
                  x2={pos.x}
                  y2={pos.y}
                  stroke={active ? "var(--gold)" : "var(--masa)"}
                  strokeOpacity={active ? 0.9 : 0.16}
                  strokeWidth={active ? node.edgeWidth + 0.6 : node.edgeWidth}
                />
              );
            })}
          </g>

          <g aria-hidden="true">
            <circle
              cx={CX}
              cy={CY}
              r={34}
              fill="var(--board-soft)"
              stroke="var(--gold)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
            />
            <g
              transform={`translate(${CX - 19}, ${CY - 19}) scale(1.58)`}
              fill="none"
              stroke="var(--masa)"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={PEPPER_STEM} />
              <path d={PEPPER_BODY} />
            </g>
            <text
              x={CX}
              y={CY + 50}
              textAnchor="middle"
              fontSize={11}
              fill="var(--masa)"
              fillOpacity={0.7}
              fontFamily="var(--font-plex-mono), monospace"
            >
              u/{analysis.username}
            </text>
          </g>

          {nodes.map((node) => {
            const pos = positions[node.id] ?? { x: CX, y: CY };
            const active = hoveredId === node.id;
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={nodeAriaLabel(node)}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="cursor-grab"
                style={{ touchAction: "none" }}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId((id) => (id === node.id ? null : id))}
                onFocus={() => setHoveredId(node.id)}
                onBlur={() => setHoveredId((id) => (id === node.id ? null : id))}
                onPointerDown={(e) => handlePointerDown(e, node)}
                onPointerMove={(e) => handlePointerMove(e, node)}
                onPointerUp={() => handlePointerEnd(node)}
                onPointerCancel={() => handlePointerEnd(node)}
              >
                <circle
                  r={node.r}
                  fill={node.fill}
                  stroke="var(--gold)"
                  strokeOpacity={active ? 1 : node.isSelf ? 0.8 : 0}
                  strokeWidth={node.isSelf ? 2 : 1.25}
                />
                {node.rank < 4 && (
                  <text
                    y={node.r + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--masa)"
                    fillOpacity={0.55}
                    fontFamily="var(--font-plex-mono), monospace"
                    aria-hidden="true"
                  >
                    {node.author}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hovered && hoveredPos && (
          <div
            className="pointer-events-none absolute z-20 w-max max-w-[18rem]"
            style={{
              left: `${(hoveredPos.x / VIEW_W) * 100}%`,
              top: `${(hoveredPos.y / VIEW_H) * 100}%`,
              transform:
                hoveredPos.y < 150
                  ? "translate(-50%, 18px)"
                  : "translate(-50%, calc(-100% - 18px))",
            }}
          >
            <div className="rounded border border-gold/30 bg-board-soft p-3 font-mono text-xs">
              {hovered.isSelf && (
                <p className="mb-1 text-[10px] tracking-[0.12em] text-gold">
                  HIS MOST FREQUENT CONVERSATION PARTNER: HIMSELF
                </p>
              )}
              <p className="text-masa">
                u/{hovered.author} · {formatNumber(hovered.replies)} replies ·{" "}
                {subredditLabel(hovered.subreddits)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-masa/50">
        <p>…and {formatNumber(othersCount)} others</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-hidden="true">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-chile" /> r/Chipotle
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-corn" /> r/tacobell
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-guac" /> r/subway
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-kraft-deep" /> elsewhere
          </li>
        </ul>
      </div>

      <table className="sr-only">
        <caption>Top reply partners of u/{analysis.username}</caption>
        <thead>
          <tr>
            <th scope="col">User</th>
            <th scope="col">Replies</th>
            <th scope="col">Shared subreddits</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id}>
              <th scope="row">
                u/{node.author}
                {node.isSelf ? " (himself)" : ""}
              </th>
              <td>{formatNumber(node.replies)}</td>
              <td>{node.subreddits.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── section ─────────────────────────────────────────────────── */

export function Constellation() {
  return (
    <Section
      id="regulars"
      index="№ 09"
      kicker="FRONT OF HOUSE"
      title="The Regulars"
      subtitle="8,609 people replied to. These are the ones who kept coming back."
      dark
    >
      <ConstellationChart />
    </Section>
  );
}
