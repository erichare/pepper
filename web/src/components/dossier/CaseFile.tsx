"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Section } from "@/components/Section";
import { profile } from "@/lib/data";
import { hashString } from "@/lib/format";
import type { BiographicalFact, Confidence, SourceLink } from "@/lib/types";

interface StampSpec {
  label: string;
  className: string;
}

/** Darker gold (#8a6a1f) for PLAUSIBLE — token gold fails contrast on crema. */
const STAMPS: Record<Confidence, StampSpec> = {
  high: { label: "CONFIRMED", className: "text-guac" },
  medium: { label: "PLAUSIBLE", className: "text-[#8a6a1f]" },
  low: { label: "CAP?", className: "text-chile" },
};

/** The running wealth bit: net worth $20–50M, butler, chauffeur, private security. */
const FEATURED_PATTERN = /20[–-]?50|\bwealth|butler/i;

function isFeaturedFact(fact: BiographicalFact): boolean {
  return fact.category === "other" && FEATURED_PATTERN.test(fact.value);
}

const ALL_FACTS: readonly BiographicalFact[] = profile.dossier.biographical_facts ?? [];
const FEATURED_FACT = ALL_FACTS.find(isFeaturedFact);
const ORDERED_FACTS: readonly BiographicalFact[] = FEATURED_FACT
  ? [FEATURED_FACT, ...ALL_FACTS.filter((fact) => fact !== FEATURED_FACT)]
  : ALL_FACTS;

function PaperClip() {
  return (
    <svg
      viewBox="0 0 20 44"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="absolute -top-3 left-5 h-9 w-4 rotate-3 text-ink/40"
    >
      <path d="M10 3.5c3 0 5.5 2.4 5.5 5.4v24.6a5.5 5.5 0 0 1-11 0V12a3.5 3.5 0 0 1 7 0v19" />
    </svg>
  );
}

interface ConfidenceStampProps {
  confidence: Confidence;
  /** Deterministic seed (hash of the claim) for rotation jitter. */
  seed: number;
  large?: boolean;
}

function ConfidenceStamp({ confidence, seed, large = false }: ConfidenceStampProps) {
  const reducedMotion = useReducedMotion();
  const spec = STAMPS[confidence];
  const jitter = (seed % 7) - 3;
  const stampClass = `stamp ${spec.className} ${large ? "text-3xl sm:text-4xl" : "text-lg"}`;

  return (
    <span className="inline-flex shrink-0">
      {reducedMotion ? (
        <span aria-hidden="true" className={stampClass} style={{ transform: `rotate(${jitter}deg)` }}>
          {spec.label}
        </span>
      ) : (
        <motion.span
          aria-hidden="true"
          className={stampClass}
          initial={{ opacity: 0, scale: 1.6, rotate: jitter - 8 }}
          whileInView={{
            opacity: [0, 1, 1],
            scale: [1.6, 0.95, 1],
            rotate: [jitter - 8, jitter + 2, jitter],
          }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.25, ease: "easeOut", times: [0, 0.6, 1] }}
        >
          {spec.label}
        </motion.span>
      )}
      <span className="sr-only">Confidence: {confidence}</span>
    </span>
  );
}

interface ExhibitChipProps {
  link: SourceLink;
}

function ExhibitChip({ link }: ExhibitChipProps) {
  const chipClass =
    "inline-block rounded border border-ink/15 bg-masa px-1.5 py-0.5 font-mono text-[10px] text-ink/70";
  if (!link.permalink) {
    return <span className={chipClass}>{link.id}</span>;
  }
  return (
    <a
      href={link.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className={`${chipClass} hover:border-chile hover:text-chile`}
    >
      {link.id} ↗
    </a>
  );
}

interface SourceExhibitsProps {
  links: readonly SourceLink[];
  panelId: string;
}

function SourceExhibits({ links, panelId }: SourceExhibitsProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/60 underline-offset-2 hover:text-chile hover:underline"
      >
        Sources: {links.length} exhibit{links.length === 1 ? "" : "s"} {open ? "▲" : "▼"}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            className="overflow-hidden"
            initial={reducedMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducedMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            <ul className="flex flex-wrap gap-1.5 pt-2">
              {links.map((link) => (
                <li key={link.id}>
                  <ExhibitChip link={link} />
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FactCardProps {
  fact: BiographicalFact;
  featured: boolean;
  withPaperClip: boolean;
}

function FactCard({ fact, featured, withPaperClip }: FactCardProps) {
  const seed = hashString(fact.value);
  const rotation = ((seed % 3) - 1) * 1.5;
  const links = fact.source_links ?? [];
  const panelId = `exhibits-${seed.toString(36)}`;

  return (
    <article
      className={`relative mb-4 break-inside-avoid rounded p-4 shadow-sm ${
        featured ? "border-2 border-gold/50 bg-gold/10" : "bg-crema"
      }`}
      style={{
        transform: `rotate(${rotation}deg)`,
        ...(featured ? { columnSpan: "all" as const } : {}),
      }}
    >
      {withPaperClip && <PaperClip />}
      <span className="inline-block rounded bg-board px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-masa">
        {fact.category}
      </span>
      <p className={`mt-3 leading-relaxed text-ink ${featured ? "text-base sm:max-w-3xl" : "text-sm"}`}>
        {fact.value}
      </p>
      <div className="mt-2 flex justify-end">
        <ConfidenceStamp confidence={fact.confidence} seed={seed} large={featured} />
      </div>
      {links.length > 0 && <SourceExhibits links={links} panelId={panelId} />}
    </article>
  );
}

export function CaseFile() {
  return (
    <Section
      id="case-file"
      index="№ 08"
      kicker="PERSONNEL RECORDS"
      title="The Case File"
      subtitle="Self-disclosed biographical claims, with citations. Confidence assessed."
    >
      <div className="relative mt-6 rounded-lg border border-kraft-deep bg-kraft p-4 pt-8 shadow-lg sm:p-8 sm:pt-10">
        <div className="absolute -top-4 left-6 rounded-t border border-b-0 border-kraft-deep bg-kraft px-4 py-1 font-mono text-xs tracking-[0.08em] text-ink/80">
          SUBJECT: NEWPPINPOINT · FILE № CMG-20514
        </div>
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {ORDERED_FACTS.map((fact, index) => (
            <FactCard
              key={fact.value}
              fact={fact}
              featured={FEATURED_FACT ? fact === FEATURED_FACT : false}
              withPaperClip={index % 5 === 0}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}
