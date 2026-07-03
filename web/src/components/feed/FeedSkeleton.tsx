/** Shimmer placeholders shown while feed posts load (route load or sort change). */

interface FeedSkeletonProps {
  count?: number;
}

const pulse = "animate-pulse motion-reduce:animate-none rounded bg-kraft/60";

export function FeedSkeleton({ count = 5 }: FeedSkeletonProps) {
  return (
    <ul className="mt-6 space-y-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="rounded-lg border border-kraft bg-crema p-4">
          <div className={`h-3 w-40 ${pulse}`} />
          <div className={`mt-3 h-4 w-3/4 ${pulse}`} />
          <div className={`mt-2 h-3 w-full ${pulse} bg-kraft/40`} />
          <div className={`mt-1.5 h-3 w-5/6 ${pulse} bg-kraft/40`} />
          <div className={`mt-4 h-8 w-56 rounded-full ${pulse} bg-kraft/50`} />
        </li>
      ))}
    </ul>
  );
}
