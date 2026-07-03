/**
 * Real Code 39 barcode renderer. Encodes the full 43-character set plus
 * the `*` start/stop delimiter using the standard 9-element narrow/wide
 * sequences (three wide elements per character — "3 of 9"), a 1:3
 * narrow:wide ratio, single narrow inter-character gaps, and 10-unit
 * quiet zones. The output is a genuinely scannable pattern.
 */

/**
 * Standard Code 39 encoding table. Each value is a 9-character string
 * over {0,1} where positions 0,2,4,6,8 are bars and 1,3,5,7 are spaces;
 * "1" = wide (3 units), "0" = narrow (1 unit).
 */
const CODE39_PATTERNS: Readonly<Record<string, string>> = {
  "0": "000110100",
  "1": "100100001",
  "2": "001100001",
  "3": "101100000",
  "4": "000110001",
  "5": "100110000",
  "6": "001110000",
  "7": "000100101",
  "8": "100100100",
  "9": "001100100",
  A: "100001001",
  B: "001001001",
  C: "101001000",
  D: "000011001",
  E: "100011000",
  F: "001011000",
  G: "000001101",
  H: "100001100",
  I: "001001100",
  J: "000011100",
  K: "100000011",
  L: "001000011",
  M: "101000010",
  N: "000010011",
  O: "100010010",
  P: "001010010",
  Q: "000000111",
  R: "100000110",
  S: "001000110",
  T: "000010110",
  U: "110000001",
  V: "011000001",
  W: "111000000",
  X: "010010001",
  Y: "110010000",
  Z: "011010000",
  "-": "010000101",
  ".": "110000100",
  " ": "011000100",
  $: "010101000",
  "/": "010100010",
  "+": "010001010",
  "%": "000101010",
  "*": "010010100",
};

const NARROW = 1;
const WIDE = 3;
const INTER_CHAR_GAP = NARROW;
const QUIET_ZONE = 10;
const BAR_HEIGHT = 40;

interface BarRect {
  x: number;
  width: number;
}

interface EncodedBarcode {
  bars: readonly BarRect[];
  totalWidth: number;
}

/** Strip unsupported characters and interior delimiters, uppercase the rest. */
function sanitizeCode39(value: string): string {
  return value
    .toUpperCase()
    .split("")
    .filter((ch) => ch !== "*" && CODE39_PATTERNS[ch] !== undefined)
    .join("");
}

/** Encode `*value*` into bar x-offsets/widths in narrow-module units. */
function encodeCode39(value: string): EncodedBarcode {
  const text = `*${sanitizeCode39(value)}*`;
  const bars: BarRect[] = [];
  let x = QUIET_ZONE;

  for (const ch of text) {
    const pattern = CODE39_PATTERNS[ch];
    if (pattern === undefined) continue;
    for (let i = 0; i < 9; i += 1) {
      const width = pattern.charAt(i) === "1" ? WIDE : NARROW;
      if (i % 2 === 0) {
        bars.push({ x, width });
      }
      x += width;
    }
    x += INTER_CHAR_GAP;
  }

  return { bars, totalWidth: x - INTER_CHAR_GAP + QUIET_ZONE };
}

export interface Barcode39Props {
  value: string;
  className?: string;
}

/**
 * Scannable Code 39 barcode as inline SVG: ink bars on crema, ~40px tall.
 * Decorative — always hidden from assistive tech.
 */
export function Barcode39({ value, className }: Barcode39Props) {
  const { bars, totalWidth } = encodeCode39(value);

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${BAR_HEIGHT}`}
      className={className ?? "h-10 w-full"}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x={0} y={0} width={totalWidth} height={BAR_HEIGHT} fill="var(--crema)" />
      {bars.map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={0}
          width={bar.width}
          height={BAR_HEIGHT}
          fill="var(--ink)"
        />
      ))}
    </svg>
  );
}
