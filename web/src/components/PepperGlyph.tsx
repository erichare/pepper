interface PepperGlyphProps {
  className?: string;
}

/** Hand-drawn single-weight chili glyph — the site mark. Not a trademarked medallion. */
export function PepperGlyph({ className }: PepperGlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14.5 6.5c.3-1.8 1.6-3 3.5-3.2" />
      <path d="M14.5 6.5c4 .5 6 3.4 5.4 7-.7 4.4-5 7.8-10.4 7.2C4.9 20.2 2.5 17 3 13.5c.2-1.4 1.2-2.3 2.6-2.2 2.4.2 2.7 2.6 5 2.9 2 .2 3.5-1.3 3.7-3.4.1-1.6-.2-3-.3-4.3z" />
    </svg>
  );
}
