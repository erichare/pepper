import { FeedHeader } from "@/components/feed/FeedHeader";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";

/**
 * Instant loading UI for The Line. Streams while the server component fetches
 * the listing (a cold Apify scrape can take a few seconds), so the page never
 * shows a blank screen on first load or navigation.
 */
export default function FeedLoading() {
  return (
    <div className="bg-masa text-ink">
      <FeedHeader />
      <div className="px-4 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-2xl">
          <div className="h-8 w-44 animate-pulse rounded-md bg-kraft/50 motion-reduce:animate-none" />
          <FeedSkeleton count={5} />
        </div>
      </div>
    </div>
  );
}
