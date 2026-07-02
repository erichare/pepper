/**
 * TypeScript mirrors of the JSON emitted by `pepper archive webexport`.
 * Source of truth: src/pepper/archive/webexport/ in the repo root.
 */

// ── profile.json ────────────────────────────────────────────────

export type Confidence = "low" | "medium" | "high";

export interface SourceLink {
  id: string;
  permalink: string | null;
}

export interface BiographicalFact {
  category: string;
  value: string;
  confidence: Confidence;
  sources: string[];
  source_links: SourceLink[];
}

export interface VoiceGuide {
  tone: string;
  quirks: string[];
  vocabulary: string[];
  dos: string[];
  donts: string[];
  example_openers: string[];
}

export interface Dossier {
  summary: string;
  interests: string[];
  opinions: string[];
  values: string[];
  personality: string[];
  voice_guide: VoiceGuide;
  biographical_facts: BiographicalFact[];
}

export interface ProfileMeta {
  username: string;
  prompt_version: string;
  dossier_created_utc: number;
  corpus_hash: string;
  item_count: number;
  data_updated_utc: number;
  first_item_utc: number;
  last_item_utc: number;
}

export interface Profile {
  dossier: Dossier;
  meta: ProfileMeta;
}

// ── persona.json ────────────────────────────────────────────────

export interface Persona {
  summary: string;
  voice_guide: VoiceGuide;
  personality: string[];
  interests: string[];
  opinions: string[];
  values: string[];
}

// ── examples.json ───────────────────────────────────────────────

export type LengthClass = "short" | "medium" | "long";

export interface FewShotExample {
  id: string;
  postTitle: string;
  body: string;
  score: number | null;
  lengthClass: LengthClass;
  tags: string[];
}

// ── analysis.json (fields the app consumes) ─────────────────────

export interface SubredditStat {
  subreddit: string;
  count: number;
  avg_score: number;
}

export interface HeatmapCell {
  weekday: number; // 1=Monday … 7=Sunday (ISO, from polars)
  hour: number; // 0–23 UTC
  count: number;
}

export interface KarmaByYear {
  year: number;
  score: number;
  count: number;
}

export interface WordCount {
  word: string;
  count: number;
}

export interface PhraseCount {
  phrase: string;
  count: number;
}

export interface TopicSummary {
  topic: number;
  size: number;
  terms: string[];
}

export interface Interlocutor {
  author: string;
  replies: number;
  subreddits: string[];
}

export interface ActivityGap {
  days: number;
  from: string; // ISO timestamp
  to: string; // ISO timestamp
}

export interface Analysis {
  username: string;
  stats: {
    totals: {
      items: number;
      submissions: number;
      comments: number;
      subreddits: number;
      first_activity: string; // ISO timestamp
      last_activity: string; // ISO timestamp
    };
    subreddits: SubredditStat[];
    timeline: { year_month: string; count: number; submissions: number; comments: number }[];
    heatmap: HeatmapCell[];
    karma: {
      total_score: number;
      avg_score: number;
      median_score: number;
      max_score: number;
      min_score: number;
      by_year: KarmaByYear[];
    };
    activity_gaps: ActivityGap[];
  };
  linguistic: {
    vocabulary: { total_words: number; unique_words: number; richness: number };
    top_words: WordCount[];
    distinctive_bigrams: PhraseCount[];
    distinctive_trigrams: PhraseCount[];
    tone: { question_ratio: number; exclamation_ratio: number; avg_words_per_item: number };
    readability: Record<string, number>;
  };
  topics: {
    n_topics: number;
    topics: TopicSummary[];
    over_time: { year: number; topic: number; count: number }[];
  };
  graph: {
    metrics: { distinct_interlocutors: number };
    top_interlocutors: Interlocutor[];
  };
}

// ── timeline.json ───────────────────────────────────────────────

export interface Timeline {
  months: string[]; // "YYYY-MM", dense
  subreddits: string[]; // top subs + "other"
  series: Record<string, number[]>; // aligned to months
}

// ── hall_of_fame.json ───────────────────────────────────────────

export interface HofItem {
  id: string;
  type: "comment" | "submission";
  subreddit: string | null;
  score: number;
  title: string | null;
  body: string | null;
  permalink: string | null;
  created_utc: number;
  status: string;
}

export interface HallOfFame {
  top_comments: HofItem[];
  bottom_comments: HofItem[];
  top_submissions: HofItem[];
  bottom_submissions: HofItem[];
}

// ── media.json ──────────────────────────────────────────────────

export interface MediaEntry {
  file: string;
  sha256: string;
  item_id: string;
  permalink: string | null;
  subreddit: string | null;
  title: string | null;
  created_utc: number;
  score: number | null;
  width: number | null;
  height: number | null;
}

// ── browse shards (web/public/data/browse/) ─────────────────────

export interface BrowseItem {
  id: string;
  type: "comment" | "submission";
  subreddit: string | null;
  created_utc: number;
  score: number | null;
  title: string | null;
  body: string | null;
  permalink: string | null;
  status: string;
  has_media: boolean;
}

export interface BrowseShardMeta {
  file: string;
  subreddit: string;
  year: number;
  count: number;
}

export interface BrowseManifest {
  total: number;
  shards: BrowseShardMeta[];
  subreddits: { subreddit: string; count: number }[];
  top_subreddits: string[];
}

// ── live feed (/api/feed) ───────────────────────────────────────

export type FeedSort = "hot" | "new" | "top";

export interface FeedPost {
  id: string;
  fullname: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  numComments: number;
  createdUtc: number;
  permalink: string;
  flair: string | null;
  thumbnail: string | null;
  preview: { url: string; width: number; height: number } | null;
  gallery: { url: string; width: number; height: number }[] | null;
  isVideo: boolean;
}

export interface FeedResponse {
  posts: FeedPost[];
  after: string | null;
  sort: FeedSort;
  fetchedAt: number;
  stale: boolean;
}

// ── reply generation (/api/reply) ───────────────────────────────

export type ReplyMode = "default" | "zinger" | "rant";

export interface ReplyRequest {
  postId: string;
  title: string;
  selftext?: string;
  flair?: string | null;
  mode?: ReplyMode;
  regenerate?: boolean;
  previousReply?: string | null;
}
