/** Formatting helpers shared across the app. */

const nf = new Intl.NumberFormat("en-US");

export function formatNumber(n: number): string {
  return nf.format(n);
}

/** Reddit-style score: proper minus sign, thousands separators. */
export function formatScore(score: number): string {
  const abs = nf.format(Math.abs(score));
  if (score < 0) return `−${abs}`;
  if (score > 0) return `+${abs}`;
  return "0";
}

export function formatUtcDate(utcSeconds: number): string {
  return new Date(utcSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2023-07" -> "Jul 2023" */
export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function timeAgo(utcSeconds: number, nowMs?: number): string {
  const seconds = Math.max(0, Math.floor((nowMs ?? Date.now()) / 1000 - utcSeconds));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Deterministic 32-bit hash for seeded pseudo-randomness (score-decay gag, example rotation). */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG from a seed — deterministic sequences per post id. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
