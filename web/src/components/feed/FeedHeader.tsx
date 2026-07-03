/** Static header + disclaimer bar for The Line. Shared by the page and its loading state. */
export function FeedHeader() {
  return (
    <>
      <header className="dark-section relative overflow-hidden grain bg-board text-masa">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.14em] text-gold">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-chile animate-pulse motion-reduce:animate-none"
            />
            LIVE FROM r/CHIPOTLE
          </p>
          <h1 className="display mt-3 text-4xl sm:text-6xl">The Line</h1>
          <p className="mt-4 max-w-xl text-sm text-masa/70 sm:text-base">
            Current posts from r/Chipotle, refreshed every few minutes. Availability may vary by
            location.
          </p>
        </div>
      </header>

      <div className="border-y border-kraft bg-crema">
        <p className="mx-auto max-w-2xl px-4 py-2.5 font-mono text-xs text-ink/70">
          Every reply on this page is AI parody. The real one is worse.
        </p>
      </div>
    </>
  );
}
