import type { Brand } from "../brand.ts";
import { UsageError } from "../errors.ts";
import { dominantEol, groups, joinLines, splitLines } from "./lines.ts";
import type { Eol } from "./lines.ts";

export const INDICATORS = [
  "IND1",
  "IND2",
  "IND3",
  "IND4",
  "IND5",
  "IND6",
] as const;

export type Indicator = (typeof INDICATORS)[number];

export function indicatorFromName(text: string): Indicator | null {
  const upper = text.toUpperCase();

  return INDICATORS.find((i) => i === upper) ?? null;
}

export function parseIndicator(text: string): Indicator {
  const indicator = indicatorFromName(text);

  if (indicator === null) {
    throw new UsageError("--indicator must be IND1..IND6");
  }

  return indicator;
}

export type Rgb = Brand<readonly [number, number, number], "Rgb">;

export function isRgb(parts: readonly number[]): parts is Rgb {
  return (
    parts.length === 3 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  );
}

export function parseRgb(text: string): Rgb {
  const parts = text.split(",").map(Number);

  if (!isRgb(parts)) {
    throw new UsageError(`--rgb expects R,G,B in 0..255, got ${text}`);
  }

  return parts;
}

export type LedEntry =
  | { kind: "led"; indicator: Indicator; func: string; rgb: Rgb }
  | { kind: "disabled"; inner: LedEntry }
  | { kind: "blank" }
  | { kind: "unparsed" };

export type LedLine = { raw: string; text: string; entry: LedEntry };

export type LedFile = { lines: LedLine[]; eol: Eol };

const LED =
  /^\[(IND[1-6])\]>\[([^[\]]+)\]\[(\d{1,3})\]\[(\d{1,3})\]\[(\d{1,3})\]$/i;

export function parseLedEntry(text: string): LedEntry {
  const t = text.trim();

  if (t === "") {
    return { kind: "blank" };
  }

  if (t.startsWith("*")) {
    return { kind: "disabled", inner: parseLedEntry(t.slice(1)) };
  }

  const g = groups(LED, t, 5);

  if (g === null) {
    return { kind: "unparsed" };
  }

  const indicator = indicatorFromName(g[0]);
  const rgb = [Number(g[2]), Number(g[3]), Number(g[4])];

  return indicator !== null && isRgb(rgb)
    ? { kind: "led", indicator, func: g[1], rgb }
    : { kind: "unparsed" };
}

export function parseLed(text: string): LedFile {
  const raw = splitLines(text);

  return {
    eol: dominantEol(raw),
    lines: raw.map(({ raw: line, text: t }) => ({
      raw: line,
      text: t,
      entry: parseLedEntry(t),
    })),
  };
}

export function serializeLed(file: LedFile): string {
  return joinLines(file.lines);
}
