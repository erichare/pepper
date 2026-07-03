"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

const TOTAL_KARMA = "−11,332";
const SHOW_AFTER_PX = 700;

/** Persistent running gag: total karma fades into the nav once the hero scrolls away. */
export function KarmaTicker() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SHOW_AFTER_PX);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Derived, not stored: the ticker only belongs on the dossier once scrolled past the hero.
  const visible = pathname === "/" && scrolled;

  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="tnum hidden sm:inline-block font-mono text-xs font-semibold text-downvote"
          aria-label="Running total karma: minus 11,332"
        >
          {TOTAL_KARMA}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
