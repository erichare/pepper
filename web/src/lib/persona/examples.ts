/**
 * Few-shot example selection for the newppinpoint persona prompt.
 *
 * `fixedExamples` is a deterministic, hand-ordered slice per reply mode (goes
 * into the cacheable system prompt); `rotatingExamples` picks 3 more from the
 * remainder pool, seeded by post id + mode + attempt, so each post sees a
 * slightly different register without breaking prompt-cache hits.
 */

import examplesJson from "@/data/examples.json";
import { hashString, seededRandom } from "@/lib/format";
import type { FewShotExample, LengthClass, ReplyMode } from "@/lib/types";

const allExamples = examplesJson as unknown as FewShotExample[];

/**
 * Deterministic ordering inside each length pool: tag-bearing examples
 * (dismissal, your-quirk, pepper, wealth-bit, …) first — they carry the most
 * signature voice — then stable by id.
 */
function byInterestThenId(a: FewShotExample, b: FewShotExample): number {
  const aTagged = a.tags.length > 0 ? 1 : 0;
  const bTagged = b.tags.length > 0 ? 1 : 0;
  if (aTagged !== bTagged) return bTagged - aTagged;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function pool(length: LengthClass): FewShotExample[] {
  return allExamples.filter((e) => e.lengthClass === length).sort(byInterestThenId);
}

const SHORT: FewShotExample[] = pool("short");
const MEDIUM: FewShotExample[] = pool("medium");
const LONG: FewShotExample[] = pool("long");

interface ModeMix {
  readonly short: number;
  readonly medium: number;
  readonly long: number;
}

const MODE_MIX: Record<ReplyMode, ModeMix> = {
  default: { short: 4, medium: 3, long: 1 },
  zinger: { short: 7, medium: 1, long: 0 },
  rant: { short: 2, medium: 3, long: 3 },
};

/**
 * The deterministic per-mode example set for the system prompt.
 * default → 4 short + 3 medium + 1 long; zinger → 7 short + 1 medium;
 * rant → 3 long + 3 medium + 2 short.
 */
export function fixedExamples(mode: ReplyMode): FewShotExample[] {
  const mix = MODE_MIX[mode];
  if (mode === "rant") {
    return [
      ...LONG.slice(0, mix.long),
      ...MEDIUM.slice(0, mix.medium),
      ...SHORT.slice(0, mix.short),
    ];
  }
  return [
    ...SHORT.slice(0, mix.short),
    ...MEDIUM.slice(0, mix.medium),
    ...LONG.slice(0, mix.long),
  ];
}

/**
 * Three extra examples from the pool not used by `fixedExamples(mode)`,
 * chosen deterministically from `seededRandom(hashString(postId + mode +
 * attempt))`. `attempt` bumps on regenerate so the retry sees fresh register.
 */
export function rotatingExamples(
  postId: string,
  mode: ReplyMode,
  attempt: number,
): FewShotExample[] {
  const fixedIds = new Set(fixedExamples(mode).map((e) => e.id));
  const available = allExamples.filter((e) => !fixedIds.has(e.id));
  const rand = seededRandom(hashString(postId + mode + String(attempt)));

  const picks: FewShotExample[] = [];
  const count = Math.min(3, available.length);
  for (let i = 0; i < count; i++) {
    const index = Math.floor(rand() * available.length);
    picks.push(available[index]);
    available.splice(index, 1);
  }
  return picks;
}
