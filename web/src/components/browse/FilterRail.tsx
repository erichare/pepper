"use client";

import { useEffect, useMemo, useState } from "react";
import type { BrowseManifest } from "@/lib/types";
import {
  BROWSE_YEARS,
  DEFAULT_SORT,
  type BrowseFilters,
  type BrowseItemType,
} from "@/lib/browse";
import { formatNumber } from "@/lib/format";

const TOP_CHIP_COUNT = 15;
const SEARCH_DEBOUNCE_MS = 300;

interface FilterRailProps {
  manifest: BrowseManifest | null;
  filters: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
}

interface RailContentProps extends FilterRailProps {
  query: string;
  onQueryChange: (value: string) => void;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  onReset: () => void;
}

const TYPE_OPTIONS: readonly { value: BrowseItemType | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "comment", label: "Comments" },
  { value: "submission", label: "Posts" },
];

function hasActiveFilters(filters: BrowseFilters): boolean {
  return (
    filters.sub !== undefined ||
    filters.year !== undefined ||
    filters.type !== undefined ||
    filters.q !== undefined ||
    filters.sort !== DEFAULT_SORT
  );
}

function chipClass(active: boolean): string {
  return active
    ? "bg-chile text-crema border-chile"
    : "bg-crema text-ink border-kraft hover:border-kraft-deep";
}

function SubredditChips({
  manifest,
  filters,
  onChange,
  expanded,
  onExpandedChange,
}: RailContentProps) {
  const sorted = useMemo(
    () =>
      manifest === null ? [] : [...manifest.subreddits].sort((a, b) => b.count - a.count),
    [manifest],
  );
  const shown = expanded ? sorted : sorted.slice(0, TOP_CHIP_COUNT);

  if (manifest === null) {
    return (
      <div className="flex flex-wrap gap-1.5" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="h-6 w-20 animate-pulse rounded-full bg-kraft/50" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div
        className={`flex flex-wrap gap-1.5 ${expanded ? "max-h-72 overflow-y-auto pr-1" : ""}`}
      >
        {shown.map((entry) => {
          const active = filters.sub === entry.subreddit;
          return (
            <button
              key={entry.subreddit}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange({ ...filters, sub: active ? undefined : entry.subreddit })
              }
              className={`rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors ${chipClass(active)}`}
            >
              r/{entry.subreddit}{" "}
              <span className={`tnum ${active ? "text-crema/70" : "text-ink/45"}`}>
                {formatNumber(entry.count)}
              </span>
            </button>
          );
        })}
      </div>
      {sorted.length > TOP_CHIP_COUNT && (
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          className="mt-2 font-mono text-[11px] text-chile underline underline-offset-2 hover:text-chile-deep"
        >
          {expanded ? "fewer" : `more… (${formatNumber(sorted.length - TOP_CHIP_COUNT)})`}
        </button>
      )}
    </div>
  );
}

function YearControl({ filters, onChange }: RailContentProps) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by year">
      <button
        type="button"
        aria-pressed={filters.year === undefined}
        onClick={() => onChange({ ...filters, year: undefined })}
        className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${chipClass(filters.year === undefined)}`}
      >
        All
      </button>
      {BROWSE_YEARS.map((year) => {
        const active = filters.year === year;
        return (
          <button
            key={year}
            type="button"
            aria-pressed={active}
            onClick={() => onChange({ ...filters, year: active ? undefined : year })}
            className={`tnum rounded border px-2 py-1 font-mono text-[11px] transition-colors ${chipClass(active)}`}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}

function TypeControl({ filters, onChange }: RailContentProps) {
  return (
    <div className="flex gap-1" role="group" aria-label="Filter by item type">
      {TYPE_OPTIONS.map((option) => {
        const active = filters.type === option.value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange({ ...filters, type: option.value })}
            className={`flex-1 rounded border px-2 py-1 font-mono text-[11px] transition-colors ${chipClass(active)}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RailContent(props: RailContentProps) {
  const { filters, query, onQueryChange, onReset } = props;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-kraft bg-crema/40 p-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50">
            Search
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="search the walk-in…"
            className="mt-1.5 w-full rounded border border-kraft bg-crema px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink/40"
          />
        </label>
      </div>

      <div className="rounded-md border border-kraft bg-crema/40 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50">
          Subreddit
        </p>
        <SubredditChips {...props} />
      </div>

      <div className="rounded-md border border-kraft bg-crema/40 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50">
          Year
        </p>
        <YearControl {...props} />
      </div>

      <div className="rounded-md border border-kraft bg-crema/40 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50">
          Type
        </p>
        <TypeControl {...props} />
      </div>

      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={onReset}
          className="font-mono text-[11px] text-chile underline underline-offset-2 hover:text-chile-deep"
        >
          reset
        </button>
      )}
    </div>
  );
}

export function FilterRail({ manifest, filters, onChange }: FilterRailProps) {
  const [query, setQuery] = useState(filters.q ?? "");
  const [expanded, setExpanded] = useState(false);

  // Debounce free-text search into the shared filter state.
  useEffect(() => {
    const trimmed = query.trim();
    const current = filters.q ?? "";
    if (trimmed === current) return;
    const handle = setTimeout(() => {
      onChange({ ...filters, q: trimmed === "" ? undefined : trimmed });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, filters, onChange]);

  const handleReset = () => {
    setQuery("");
    onChange({ sort: DEFAULT_SORT });
  };

  const railProps: RailContentProps = {
    manifest,
    filters,
    onChange,
    query,
    onQueryChange: setQuery,
    expanded,
    onExpandedChange: setExpanded,
    onReset: handleReset,
  };

  return (
    <aside aria-label="Archive filters">
      {/* Mobile: collapsible top sheet */}
      <details className="rounded-md border border-kraft bg-crema/40 lg:hidden">
        <summary className="cursor-pointer px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-ink">
          Filters
        </summary>
        <div className="border-t border-kraft p-3">
          <RailContent {...railProps} />
        </div>
      </details>

      {/* Desktop: fixed-width rail */}
      <div className="hidden lg:block">
        <RailContent {...railProps} />
      </div>
    </aside>
  );
}
