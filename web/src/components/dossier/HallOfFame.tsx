"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { PanInfo, Variants } from "motion/react";
import { Section } from "@/components/Section";
import { hallOfFame, media } from "@/lib/data";
import { formatScore } from "@/lib/format";
import type { HofItem, MediaEntry } from "@/lib/types";
import { RedditComment } from "./RedditComment";

const DECK: readonly HofItem[] = hallOfFame.bottom_comments.slice(0, 10);

const BANGERS: readonly HofItem[] = [
  ...hallOfFame.top_submissions.slice(0, 6),
  ...hallOfFame.top_comments.slice(0, 4),
];

const MEDIA_BY_ITEM: ReadonlyMap<string, MediaEntry> = new Map(
  media.map((entry) => [entry.item_id, entry]),
);

const SWIPE_OFFSET_PX = 120;
const SWIPE_VELOCITY = 500;

const deckVariants: Variants = {
  enter: { x: 0, y: 14, scale: 0.95, rotate: 0, opacity: 0.7 },
  center: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction * 600,
    rotate: direction * 20,
    opacity: 0,
  }),
};

interface LaneLabelProps {
  children: ReactNode;
}

function LaneLabel({ children }: LaneLabelProps) {
  return (
    <h3 className="flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-chile after:h-px after:flex-1 after:bg-ink/15">
      {children}
    </h3>
  );
}

interface DeckCardProps {
  item: HofItem;
  allTimeRecord: boolean;
}

function DeckCard({ item, allTimeRecord }: DeckCardProps) {
  return (
    <div className="relative h-full">
      <RedditComment
        author="newppinpoint"
        body={item.body ?? ""}
        score={item.score}
        createdUtc={item.created_utc}
        permalink={item.permalink}
        subreddit={item.subreddit}
        className="h-full"
        badge={
          <span aria-hidden="true" className="stamp rotate-[6deg] text-3xl text-downvote">
            {formatScore(item.score)}
          </span>
        }
      />
      {allTimeRecord && (
        <span className="absolute -left-9 top-9 -rotate-12 bg-gold px-10 py-1 font-mono text-[10px] font-bold tracking-[0.22em] text-board shadow-md">
          ALL-TIME RECORD
        </span>
      )}
    </div>
  );
}

/** Static crema slips behind the top card so the deck reads as a stack. */
function DeckShadowCards() {
  return (
    <>
      {[2, 1].map((depth) => (
        <div
          key={depth}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg border border-kraft bg-crema shadow-sm"
          style={{
            transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`,
            opacity: 0.65 - depth * 0.2,
          }}
        />
      ))}
    </>
  );
}

interface DeckControlsProps {
  surveyed: number;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

function DeckControls({ surveyed, index, total, onPrev, onNext }: DeckControlsProps) {
  const buttonClass =
    "rounded border border-ink/20 bg-crema px-3 py-1 font-mono text-xs uppercase tracking-wider text-ink/70 hover:border-chile hover:text-chile";
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="font-mono text-xs text-ink/60" aria-live="polite">
        comments surveyed: <span className="tnum font-bold">{surveyed}</span> / {total}
        <span className="sr-only">
          {" "}
          — showing card {index + 1} of {total}
        </span>
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onPrev} aria-label="Previous card" className={buttonClass}>
          ← prev
        </button>
        <button type="button" onClick={onNext} aria-label="Next card" className={buttonClass}>
          next →
        </button>
      </div>
    </div>
  );
}

function RatioedDeck() {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [surveyed, setSurveyed] = useState(1);
  const [direction, setDirection] = useState(1);

  const goTo = useCallback((nextIndex: number, dir: number) => {
    setDirection(dir);
    setIndex(((nextIndex % DECK.length) + DECK.length) % DECK.length);
    setSurveyed((seen) => Math.min(DECK.length, seen + 1));
  }, []);

  const handleDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      const flung =
        Math.abs(info.offset.x) > SWIPE_OFFSET_PX || Math.abs(info.velocity.x) > SWIPE_VELOCITY;
      if (!flung) return;
      const dir = (info.offset.x !== 0 ? info.offset.x : info.velocity.x) < 0 ? -1 : 1;
      goTo(index + 1, dir);
    },
    [goTo, index],
  );

  const card = DECK[index];

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Most ratioed comments"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goTo(index + 1, 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          goTo(index - 1, -1);
        }
      }}
      className="mx-auto mt-6 max-w-xl rounded-lg"
    >
      <p className="sr-only">Use the left and right arrow keys to browse the deck.</p>
      <div className="relative h-[26rem] sm:h-[21rem]">
        <DeckShadowCards />
        {reducedMotion ? (
          <div className="absolute inset-0">
            <DeckCard item={card} allTimeRecord={index === 0} />
          </div>
        ) : (
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={card.id}
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              custom={direction}
              variants={deckVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              whileDrag={{ scale: 1.02 }}
              onDragEnd={handleDragEnd}
            >
              <DeckCard item={card} allTimeRecord={index === 0} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <DeckControls
        surveyed={surveyed}
        index={index}
        total={DECK.length}
        onPrev={() => goTo(index - 1, -1)}
        onNext={() => goTo(index + 1, 1)}
      />
    </div>
  );
}

interface BangerThumbProps {
  entry: MediaEntry;
  alt: string;
}

function BangerThumb({ entry, alt }: BangerThumbProps) {
  const src = `/media/${entry.file}`;
  if (entry.width !== null && entry.height !== null) {
    return (
      <Image
        src={src}
        alt={alt}
        width={entry.width}
        height={entry.height}
        loading="lazy"
        className="h-28 w-full rounded-t object-cover"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- archived media has no intrinsic dimensions recorded
    <img src={src} alt={alt} loading="lazy" className="h-28 w-full rounded-t object-cover" />
  );
}

interface BangerCardProps {
  item: HofItem;
}

function BangerCard({ item }: BangerCardProps) {
  const mediaEntry = item.type === "submission" ? MEDIA_BY_ITEM.get(item.id) : undefined;
  return (
    <li className="w-72 shrink-0 snap-start">
      <article className="flex h-full flex-col overflow-hidden rounded-lg border-t-4 border-upvote bg-crema shadow-sm">
        {mediaEntry && <BangerThumb entry={mediaEntry} alt={item.title ?? "Archived image"} />}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="font-mono text-[11px] text-ink/50">r/{item.subreddit ?? "reddit"}</span>
            <span className="tnum rounded-full bg-upvote/10 px-2 py-0.5 font-mono text-xs font-bold text-upvote">
              {formatScore(item.score)}
            </span>
          </div>
          {item.title && (
            <h4 className="mt-2 text-sm font-semibold leading-snug text-ink">{item.title}</h4>
          )}
          {item.body && (
            <p
              className={`mt-2 whitespace-pre-wrap leading-relaxed text-ink/75 ${
                item.title ? "line-clamp-3 text-xs" : "line-clamp-4 text-sm"
              }`}
            >
              {item.body}
            </p>
          )}
          {item.permalink && (
            <a
              href={item.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto pt-3 font-mono text-[11px] text-ink/50 underline-offset-2 hover:text-chile hover:underline"
            >
              see it in the wild →
            </a>
          )}
        </div>
      </article>
    </li>
  );
}

function BangersRow() {
  return (
    <ul
      aria-label="Highest scoring posts and comments"
      className="-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {BANGERS.map((item) => (
        <BangerCard key={item.id} item={item} />
      ))}
    </ul>
  );
}

export function HallOfFame() {
  return (
    <Section
      id="hall-of-fame"
      index="№ 07"
      kicker="EMPLOYEE RECOGNITION"
      title="The Downvote Hall of Fame"
      subtitle="Surveyed: 20,307 comments. These performed the worst. They are all real."
    >
      <div className="grid gap-16">
        <div>
          <LaneLabel>Most Ratioed</LaneLabel>
          <RatioedDeck />
        </div>
        <div>
          <LaneLabel>Certified Bangers</LaneLabel>
          <BangersRow />
        </div>
      </div>
    </Section>
  );
}
