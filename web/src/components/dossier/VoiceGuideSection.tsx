"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Section } from "@/components/Section";
import { PepperGlyph } from "@/components/PepperGlyph";
import { analysis, profile } from "@/lib/data";
import { formatNumber } from "@/lib/format";

/* ── lexicon data ────────────────────────────────────────────── */

const CHIP_MIN_PX = 14;
const CHIP_MAX_PX = 28;
const TYPE_INTERVAL_MS = 18;
const BUBBLE_STAGGER_MS = 450;

interface ChipDef {
  readonly term: string;
  /** Usage gloss for the back face — written from voice_guide.quirks. */
  readonly gloss: string;
  /** Key to match against analysis.linguistic.top_words (defaults to lowercased term). */
  readonly matchWord?: string;
}

/** Terms from profile.dossier.voice_guide.vocabulary/quirks plus a few corpus top words. */
const CHIP_DEFS: readonly ChipDef[] = [
  { term: "lol", gloss: "Punctuation for sarcasm, not laughter." },
  { term: "lmao", gloss: "Tone softener stapled to a jab." },
  { term: "haha", gloss: "Follows 'Take the L dude…'" },
  { term: "cap", gloss: "A complete sentence. Means: false." },
  { term: "Reported", gloss: "A one-word verdict. Case closed." },
  { term: "Fake", gloss: "Sibling of 'Reported.' Often adjacent." },
  { term: "Wrong", gloss: "Full rebuttal, zero elaboration." },
  { term: "womp womp", gloss: "Condolences, formally withheld." },
  { term: "skimped", gloss: "What the portion was. Every time." },
  { term: "blacklisted", gloss: "The store's fate after skimping him." },
  { term: "monkey style", gloss: "Insider order terminology." },
  { term: "Your*", gloss: "*never 'You're.' Never." },
  { term: "Pepper", gloss: "Capital P. A recurring character." },
  { term: "fajita veggies", gloss: "Extra. Always extra." },
  { term: "extra", gloss: "The most load-bearing word in the order." },
  { term: "cheese", gloss: "Audited for volume on every visit." },
];

interface LexiconChip extends ChipDef {
  readonly count?: number;
  readonly fontSize: number;
}

/** Scale chip type size by corpus frequency where a top_words match exists. */
function buildChips(): readonly LexiconChip[] {
  const counts = new Map(analysis.linguistic.top_words.map((w) => [w.word, w.count]));
  const matched = CHIP_DEFS.map((def) => counts.get((def.matchWord ?? def.term).toLowerCase()));
  const maxCount = Math.max(1, ...matched.filter((c): c is number => c !== undefined));
  return CHIP_DEFS.map((def, i) => {
    const count = matched[i];
    const fontSize =
      count === undefined
        ? 15
        : Math.round(
            (CHIP_MIN_PX + Math.sqrt(count / maxCount) * (CHIP_MAX_PX - CHIP_MIN_PX)) * 10,
          ) / 10;
    return { ...def, count, fontSize };
  });
}

const CHIPS = buildChips();

/* ── flip chip ───────────────────────────────────────────────── */

interface FlipChipProps {
  readonly term: string;
  readonly gloss: string;
  readonly count?: number;
  readonly fontSize: number;
}

function FlipChip({ term, gloss, count, fontSize }: FlipChipProps) {
  const reduced = useReducedMotion() === true;
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const flipped = hovered || pinned;
  const back = count === undefined ? gloss : `${gloss} · ${formatNumber(count)}×`;

  return (
    <li className="[perspective:700px]">
      <motion.button
        type="button"
        aria-label={`${term} — ${back}`}
        className={`relative block cursor-pointer rounded-full border border-kraft-deep bg-crema px-4 py-1.5 [transform-style:preserve-3d] ${flipped ? "z-10" : ""}`}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false);
          setPinned(false);
        }}
        onClick={() => setPinned((p) => !p)}
      >
        <span
          aria-hidden="true"
          className="block font-medium text-ink [backface-visibility:hidden]"
          style={{ fontSize, lineHeight: 1.2 }}
        >
          {term}
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 flex w-max min-w-full items-center justify-center whitespace-nowrap rounded-full bg-board px-4 font-mono text-[10px] text-masa [backface-visibility:hidden]"
          style={{ transform: "translateX(-50%) rotateY(180deg)" }}
        >
          {back}
        </span>
      </motion.button>
    </li>
  );
}

function Lexicon() {
  return (
    <div>
      <h3 className="font-mono text-xs tracking-[0.14em] text-ink/60">01 · THE LEXICON</h3>
      <ul className="mt-6 flex flex-wrap items-center gap-3">
        {CHIPS.map((chip) => (
          <FlipChip
            key={chip.term}
            term={chip.term}
            gloss={chip.gloss}
            count={chip.count}
            fontSize={chip.fontSize}
          />
        ))}
      </ul>
      <p className="mt-4 font-mono text-[11px] text-ink/50">
        Type size scales with corpus frequency. Flip a term for usage notes.
      </p>
    </div>
  );
}

/* ── do / don't poster ───────────────────────────────────────── */

interface ComplianceColumnProps {
  readonly heading: string;
  readonly rows: readonly string[];
  readonly positive: boolean;
}

function ComplianceColumn({ heading, rows, positive }: ComplianceColumnProps) {
  return (
    <div className={`bg-crema p-5 sm:p-6 border-t-8 ${positive ? "border-guac" : "border-chile"}`}>
      <h4 className={`display text-3xl ${positive ? "text-guac" : "text-chile"}`}>{heading}</h4>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row} className="flex gap-3 text-sm leading-relaxed text-ink/90">
            <span
              aria-hidden="true"
              className={`mt-0.5 font-mono font-bold ${positive ? "text-guac" : "text-chile"}`}
            >
              {positive ? "✓" : "✕"}
            </span>
            <span>{row}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompliancePoster() {
  const { dos, donts } = profile.dossier.voice_guide;
  return (
    <div>
      <h3 className="font-mono text-xs tracking-[0.14em] text-ink/60">02 · FIELD POSTER</h3>
      <div className="mt-6 overflow-hidden rounded-lg border border-kraft-deep bg-kraft-deep shadow-sm">
        <div className="bg-board px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-masa">
          FOOD SAFETY &amp; VOICE COMPLIANCE POSTER № 7
        </div>
        <div className="grid gap-px sm:grid-cols-2">
          <ComplianceColumn heading="Do" rows={dos} positive />
          <ComplianceColumn heading={"Don’t"} rows={donts} positive={false} />
        </div>
      </div>
    </div>
  );
}

/* ── typed openers ───────────────────────────────────────────── */

interface TypedBubbleProps {
  readonly text: string;
  readonly startDelayMs: number;
}

function TypedBubble({ text, startDelayMs }: TypedBubbleProps) {
  const reduced = useReducedMotion() === true;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [count, setCount] = useState(0);
  const timersRef = useRef<{ timeout?: number; interval?: number }>({});
  const done = count >= text.length;

  useEffect(() => {
    if (!inView || reduced) return;
    const timers = timersRef.current;
    timers.timeout = window.setTimeout(() => {
      timers.interval = window.setInterval(() => {
        setCount((c) => Math.min(c + 1, text.length));
      }, TYPE_INTERVAL_MS);
    }, startDelayMs);
    return () => {
      window.clearTimeout(timers.timeout);
      window.clearInterval(timers.interval);
    };
  }, [inView, reduced, startDelayMs, text.length]);

  useEffect(() => {
    if (done) window.clearInterval(timersRef.current.interval);
  }, [done]);

  const shown = reduced ? text : text.slice(0, count);
  const showCaret = !reduced && inView && !done;

  return (
    <div ref={ref} className="rounded-xl border border-kraft/70 bg-crema p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-chile"
        >
          <PepperGlyph className="h-4 w-4 text-masa" />
        </span>
        <span className="font-mono text-xs text-ink/70">u/{profile.meta.username}</span>
        <span className="font-mono text-[10px] text-ink/40">· just now</span>
      </div>
      <p className="relative mt-2 text-[15px] leading-relaxed text-ink">
        <span aria-hidden="true" className="invisible">
          {text}
        </span>
        <span aria-hidden="true" className="absolute inset-0">
          {shown}
          {showCaret && (
            <motion.span
              aria-hidden="true"
              className="inline-block text-chile"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            >
              ▊
            </motion.span>
          )}
        </span>
        <span className="sr-only">{text}</span>
      </p>
    </div>
  );
}

function ExampleOpeners() {
  const openers = profile.dossier.voice_guide.example_openers;
  const picks = openers.length > 3 ? openers.slice(1, 4) : openers.slice(0, 3);
  return (
    <div>
      <h3 className="font-mono text-xs tracking-[0.14em] text-ink/60">03 · EXAMPLE OPENERS</h3>
      <div className="mt-6 max-w-2xl space-y-4">
        {picks.map((text, i) => (
          <TypedBubble key={text} text={text} startDelayMs={i * BUBBLE_STAGGER_MS} />
        ))}
      </div>
      <p className="mt-6 font-mono text-xs text-ink/60">
        He talks like this on the next page.{" "}
        <Link
          href="/feed"
          className="text-chile underline underline-offset-4 hover:text-chile-deep"
        >
          → The Line
        </Link>
      </p>
    </div>
  );
}

/* ── section ─────────────────────────────────────────────────── */

export function VoiceGuideSection() {
  return (
    <Section
      id="voice"
      index="№ 10"
      kicker="TRAINING MATERIALS"
      title="Speak Fluent Newppinpoint"
      subtitle="A field guide to the dialect."
    >
      <div className="space-y-16">
        <Lexicon />
        <CompliancePoster />
        <ExampleOpeners />
      </div>
    </Section>
  );
}
