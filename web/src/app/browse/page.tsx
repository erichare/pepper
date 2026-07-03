import type { Metadata } from "next";
import { BrowseExplorer } from "@/components/browse/BrowseExplorer";

export const metadata: Metadata = {
  title: "The Archive — 20,514 items",
  description:
    "Every recorded order from u/newppinpoint, 2020–2026. Filter by subreddit, year, and type. Sorted by damage by default.",
};

interface BrowsePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const initialParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      initialParams[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      initialParams[key] = value[0];
    }
  }

  return (
    <div className="relative overflow-hidden grain bg-masa text-ink">
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <p className="kicker">№ — THE WALK-IN</p>
        <h1 className="display mt-3 text-4xl sm:text-6xl">The Archive</h1>
        <p className="mt-4 max-w-2xl text-base sm:text-lg text-ink/70">
          Every recorded order, 2020–2026. Sorted by damage by default.
        </p>
        <div className="mt-10 sm:mt-14">
          <BrowseExplorer initialParams={initialParams} />
        </div>
      </div>
    </div>
  );
}
