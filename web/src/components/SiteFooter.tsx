const DATA_THROUGH = "Jul 1, 2026";

export function SiteFooter() {
  return (
    <footer className="relative bg-crema text-ink/70">
      {/* receipt tear-off edge */}
      <div
        aria-hidden="true"
        className="h-2.5 w-full"
        style={{
          background:
            "linear-gradient(135deg, var(--masa) 6px, transparent 0), linear-gradient(-135deg, var(--masa) 6px, transparent 0)",
          backgroundSize: "12px 100%",
        }}
      />
      <div className="mx-auto max-w-6xl px-4 py-6 text-center font-mono text-[0.7rem] leading-relaxed tracking-wide">
        <p>
          UNOFFICIAL FAN PARODY — NOT AFFILIATED WITH CHIPOTLE MEXICAN GRILL.
        </p>
        <p>ALL QUOTES ARE REAL. UNFORTUNATELY.</p>
        <p className="mt-2 text-ink/50">
          AI replies are generated parody and are never posted to Reddit ·
          Data through {DATA_THROUGH} ·{" "}
          <a
            href="https://github.com/erichare/pepper"
            className="underline decoration-dotted hover:text-chile"
          >
            source
          </a>
        </p>
        <p className="mt-1 text-ink/40">*** CUSTOMER SINCE 2020 ***</p>
      </div>
    </footer>
  );
}
