"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { PepperGlyph } from "./PepperGlyph";

const TABS = [
  { href: "/", label: "Dossier" },
  { href: "/feed", label: "The Line" },
  { href: "/browse", label: "The Archive" },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-board text-masa border-b border-black/40">
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5"
        aria-label="Primary"
      >
        <Link href="/" className="flex items-center gap-2 group">
          <PepperGlyph className="h-5 w-5 text-chile group-hover:rotate-12 transition-transform" />
          <span className="display text-sm tracking-wide text-masa">
            The Pepper Dossier
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-4">
          {TABS.map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="relative px-2 py-1.5 font-mono text-[0.7rem] sm:text-xs uppercase tracking-[0.14em] text-masa/80 hover:text-masa transition-colors"
              >
                {tab.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-1 -bottom-px h-0.5 bg-gold"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
