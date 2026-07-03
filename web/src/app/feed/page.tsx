import type { Metadata } from "next";
import { safeFetchListing } from "@/lib/reddit";
import { FeedHeader } from "@/components/feed/FeedHeader";
import { FeedList } from "@/components/feed/FeedList";

export const metadata: Metadata = {
  title: "The Line — live r/Chipotle",
  description:
    "Current posts from r/Chipotle, refreshed every few minutes. Every reply on this page is AI parody.",
};

// Live feed: render per request (KV caching bounds the actual scraper runs) and
// give the synchronous Apify run headroom. Keeps the scraper out of the build.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function FeedPage() {
  const feed = await safeFetchListing("hot");

  return (
    <div className="bg-masa text-ink">
      <FeedHeader />
      <div className="px-4 py-10 sm:py-14">
        <FeedList initial={feed} />
      </div>
    </div>
  );
}
