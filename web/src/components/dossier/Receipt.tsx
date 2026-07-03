"use client";

import { useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { Section } from "@/components/Section";
import { analysis } from "@/lib/data";
import { formatNumber, formatScore } from "@/lib/format";
import { Barcode39 } from "./Barcode39";

/** Word-specific deadpan tooltip glosses; keys are lowercase top words. */
const WORD_GLOSSES: Readonly<Record<string, string>> = {
  get: "typically in the imperative",
  order: "his own and everyone else's",
  cheese: "rarely without a modifier",
  one: "as in, star reviews",
  lol: "usually sarcastically",
  chipotle: "the subject of everything",
  bowl: "double-wrapped, allegedly",
  chicken: "extra, always extra",
  rice: "white, on the record",
  extra: "the operative word",
  good: "used loosely",
  people: "a recurring obstacle",
};

const GENERIC_GLOSS = "frequency consistent with the record";

function wordGloss(word: string, count: number): string {
  const tail = WORD_GLOSSES[word.toLowerCase()] ?? GENERIC_GLOSS;
  return `used ${formatNumber(count)} times, ${tail}`;
}

const TOP_WORD_COUNT = 8;
const ADD_ON_COUNT = 6;

const topWords = analysis.linguistic.top_words.slice(0, TOP_WORD_COUNT);
const addOns = analysis.linguistic.distinctive_bigrams.slice(0, ADD_ON_COUNT);
const { vocabulary, readability, tone } = analysis.linguistic;
const totalKarma = analysis.stats.karma.total_score;
const orderNumber = analysis.stats.totals.items;
const customerSince = new Date(analysis.stats.totals.first_activity).getUTCFullYear();

const richnessPct = `${(vocabulary.richness * 100).toFixed(2)}%`;
const readabilityGrade = (readability["flesch_kincaid_grade"] ?? 0).toFixed(1);
const questionPct = `${Math.round(tone.question_ratio * 100)}%`;

interface ReceiptLineProps {
  label: string;
  amount: string;
  prefix?: string;
  gloss?: string;
  highlight?: boolean;
}

/** One itemized row: label, dotted leader, right-aligned amount. */
function ReceiptLine({ label, amount, prefix, gloss, highlight = false }: ReceiptLineProps) {
  return (
    <div
      className={`flex items-baseline gap-2 px-1 ${highlight ? "bg-gold/20" : ""}`}
      title={gloss}
    >
      {prefix !== undefined && <span className="w-4 shrink-0">{prefix}</span>}
      <span className="shrink-0 uppercase">{label}</span>
      <span className="mb-1 min-w-4 flex-1 self-end border-b border-dotted border-ink/40" />
      <span className="tnum shrink-0">{amount}</span>
    </div>
  );
}

function ReceiptDivider() {
  return <div className="my-3 border-t border-dashed border-ink/40" aria-hidden="true" />;
}

/** Static receipt paper content — everything between the perforated edges. */
function ReceiptPaper() {
  return (
    <div className="bg-crema px-5 py-6 font-mono text-[0.8rem] leading-relaxed text-ink sm:px-8">
      <div className="text-center">
        <p className="text-sm font-bold tracking-[0.2em]">THE PEPPER DOSSIER</p>
        <p className="tnum mt-1">ORDER #{formatNumber(orderNumber)}</p>
        <div className="tnum mt-1 flex justify-between text-ink/80">
          <span>SERVER: REDDIT</span>
          <span>REGISTER: 4</span>
        </div>
      </div>

      <ReceiptDivider />

      <div className="space-y-0.5">
        {topWords.map((entry, i) => (
          <ReceiptLine
            key={entry.word}
            prefix={String(i + 1)}
            label={entry.word}
            amount={formatNumber(entry.count)}
            gloss={wordGloss(entry.word, entry.count)}
            highlight={entry.word.toLowerCase() === "lol"}
          />
        ))}
      </div>

      <ReceiptDivider />

      <p className="px-1 font-bold tracking-widest">ADD-ONS</p>
      <div className="mt-1 space-y-0.5">
        {addOns.map((entry) => (
          <ReceiptLine
            key={entry.phrase}
            prefix="+"
            label={entry.phrase}
            amount={formatNumber(entry.count)}
            gloss={`ordered together ${formatNumber(entry.count)} times`}
          />
        ))}
      </div>

      <ReceiptDivider />

      <div className="space-y-0.5">
        <ReceiptLine label="Subtotal (words)" amount={formatNumber(vocabulary.total_words)} />
        <ReceiptLine label="Vocab richness tax" amount={richnessPct} />
        <ReceiptLine label="Readability grade" amount={readabilityGrade} />
        <ReceiptLine label="Questions asked" amount={questionPct} />
      </div>

      <div className="my-3 border-t-4 border-double border-ink/60" aria-hidden="true" />

      <div className="flex items-baseline gap-2 px-1 text-base font-bold text-downvote">
        <span className="shrink-0 uppercase">Total karma due</span>
        <span className="mb-1 min-w-4 flex-1 self-end border-b border-dotted border-downvote/50" />
        <span className="tnum shrink-0 text-lg">{formatScore(totalKarma)}</span>
      </div>

      <ReceiptDivider />

      <div className="text-center leading-loose">
        <p>*** CUSTOMER SINCE {customerSince} ***</p>
        <p>*** BLACKLISTED: PENDING ***</p>
      </div>

      <div className="mx-auto mt-4 max-w-[260px]">
        <Barcode39 value="REPORTED" className="h-10 w-full" />
        <p className="mt-1 text-center tracking-[0.35em] text-ink/70">*REPORTED*</p>
      </div>
    </div>
  );
}

/** sr-only twin of the printed data for assistive tech. */
function ReceiptSrTable() {
  return (
    <table className="sr-only">
      <caption>Itemized linguistic profile of u/{analysis.username}</caption>
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Count</th>
        </tr>
      </thead>
      <tbody>
        {topWords.map((entry) => (
          <tr key={entry.word}>
            <th scope="row">{entry.word}</th>
            <td>{formatNumber(entry.count)}</td>
          </tr>
        ))}
        {addOns.map((entry) => (
          <tr key={entry.phrase}>
            <th scope="row">Add-on: {entry.phrase}</th>
            <td>{formatNumber(entry.count)}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">Subtotal (total words)</th>
          <td>{formatNumber(vocabulary.total_words)}</td>
        </tr>
        <tr>
          <th scope="row">Vocabulary richness</th>
          <td>{richnessPct}</td>
        </tr>
        <tr>
          <th scope="row">Readability grade (Flesch–Kincaid)</th>
          <td>{readabilityGrade}</td>
        </tr>
        <tr>
          <th scope="row">Questions asked</th>
          <td>{questionPct}</td>
        </tr>
        <tr>
          <th scope="row">Total karma</th>
          <td>{formatScore(totalKarma)}</td>
        </tr>
      </tbody>
    </table>
  );
}

const RECEIPT_ARIA_LABEL =
  `Thermal receipt itemizing u/${analysis.username}'s linguistic profile: ` +
  `top words led by "${topWords[0]?.word ?? ""}" at ${formatNumber(topWords[0]?.count ?? 0)} uses, ` +
  `${formatNumber(vocabulary.total_words)} total words, and a total karma due of ${formatScore(totalKarma)}.`;

/** № 02 — The Receipt: scroll-printed thermal receipt of the linguistic profile. */
export function Receipt() {
  const receiptRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [printing, setPrinting] = useState(false);

  const { scrollYProgress } = useScroll({
    target: receiptRef,
    offset: ["start 0.9", "start 0.35"],
  });
  const clipPath = useTransform(scrollYProgress, (p) => `inset(0 0 ${(1 - p) * 100}% 0)`);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const nowPrinting = p > 0.001 && p < 0.999;
    setPrinting((prev) => (prev === nowPrinting ? prev : nowPrinting));
  });

  const jittering = printing && !reducedMotion;

  return (
    <Section
      id="receipt"
      index="№ 02"
      kicker="YOUR ORDER"
      title="The Receipt"
      subtitle="His entire linguistic profile, itemized."
    >
      <div ref={receiptRef} className="mx-auto max-w-2xl rounded-md bg-kraft px-4 py-12 sm:px-12">
        <motion.div
          style={reducedMotion ? undefined : { clipPath }}
          className="mx-auto max-w-md"
        >
          <motion.div
            animate={jittering ? { x: [0, 1.5, -1, 0.5, 0] } : { x: 0 }}
            transition={
              jittering
                ? { duration: 0.22, repeat: Infinity, ease: "linear" }
                : { duration: 0.1 }
            }
            className="rotate-[0.5deg] shadow-xl"
            role="img"
            aria-label={RECEIPT_ARIA_LABEL}
          >
            <div className="perf-edge" aria-hidden="true" />
            <ReceiptPaper />
            <div className="perf-edge perf-edge--bottom" aria-hidden="true" />
          </motion.div>
        </motion.div>
        <ReceiptSrTable />
      </div>
    </Section>
  );
}
