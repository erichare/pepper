/**
 * Typed access to the JSON emitted by `pepper archive webexport`.
 * Import from here — never import the JSON files directly — so the
 * cast to the mirrored types lives in exactly one place.
 */

import analysisJson from "@/data/analysis.json";
import timelineJson from "@/data/timeline.json";
import hallOfFameJson from "@/data/hall_of_fame.json";
import profileJson from "@/data/profile.json";
import mediaJson from "@/data/media.json";
import type { Analysis, HallOfFame, MediaEntry, Profile, Timeline } from "./types";

export const analysis = analysisJson as unknown as Analysis;
export const timeline = timelineJson as unknown as Timeline;
export const hallOfFame = hallOfFameJson as unknown as HallOfFame;
export const profile = profileJson as unknown as Profile;
export const media = mediaJson as unknown as MediaEntry[];
