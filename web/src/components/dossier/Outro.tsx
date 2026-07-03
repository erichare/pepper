"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Section } from "@/components/Section";
import { analysis } from "@/lib/data";
import { formatUtcDate } from "@/lib/format";

const MotionLink = motion.create(Link);

/** last_activity is an ISO string; formatUtcDate takes UTC seconds. */
const LAST_SEEN = formatUtcDate(Date.parse(analysis.stats.totals.last_activity) / 1000);

/** Closing section: last-seen line, one deadpan paragraph, order-button CTA to the live feed. */
export function Outro() {
  const reduced = useReducedMotion() === true;

  return (
    <Section id="outro" index="№ 11" kicker="TO GO" title="He's still out there." dark>
      <div className="flex flex-col items-start gap-8">
        <p className="font-mono text-sm uppercase tracking-[0.14em] text-gold">
          Last seen: {LAST_SEEN}
        </p>
        <p className="max-w-xl text-base text-masa/70 sm:text-lg">
          The line moves. The bowls get made. Somewhere, a Pepper is being defended.
        </p>
        <MotionLink
          href="/feed"
          className="display inline-block rounded bg-chile px-10 py-5 text-2xl text-crema transition-colors hover:bg-chile-deep"
          whileHover={reduced ? undefined : { scale: 1.02 }}
          whileTap={reduced ? undefined : { scale: 0.98 }}
        >
          SEE WHAT HE&rsquo;D SAY <span aria-hidden="true">→</span> THE LINE
        </MotionLink>
      </div>
    </Section>
  );
}
