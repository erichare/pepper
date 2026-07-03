import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  /** e.g. "№ 03" */
  index: string;
  /** e.g. "SIDES & ANALYTICS" */
  kicker: string;
  title: string;
  subtitle?: string;
  /** dark menu-board band instead of light kraft */
  dark?: boolean;
  /** extra classes on the outer section */
  className?: string;
  children: ReactNode;
}

/**
 * Shared dossier section shell: menu-category kicker, display title,
 * light-kraft or dark-board band. Sections below the fold get
 * content-visibility via `cv-auto`.
 */
export function Section({
  id,
  index,
  kicker,
  title,
  subtitle,
  dark = false,
  className = "",
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden grain cv-auto ${
        dark ? "dark-section bg-board text-masa" : "bg-masa text-ink"
      } ${className}`}
    >
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <p className="kicker">
          {index} — {kicker}
        </p>
        <h2 className="display mt-3 text-4xl sm:text-6xl">{title}</h2>
        {subtitle && (
          <p className={`mt-4 max-w-2xl text-base sm:text-lg ${dark ? "text-masa/70" : "text-ink/70"}`}>
            {subtitle}
          </p>
        )}
        <div className="mt-10 sm:mt-14">{children}</div>
      </div>
    </section>
  );
}
