import { dominantEol, joinLines, splitLines, type Eol } from "./lines.ts";

export const INDICATORS = ["IND1", "IND2", "IND3", "IND4", "IND5", "IND6"] as const;
export type Indicator = (typeof INDICATORS)[number];
export type Rgb = [number, number, number];

export type LedEntry =
  | { kind: "led"; indicator: Indicator; func: string; rgb: Rgb }
  | { kind: "disabled"; inner: LedEntry }
  | { kind: "blank" }
  | { kind: "unparsed" };

export type LedLine = { raw: string; text: string; entry: LedEntry };
export type LedFile = { lines: LedLine[]; eol: Eol };

const LED = /^\[(IND[1-6])\]>\[([^\[\]]+)\]\[(\d{1,3})\]\[(\d{1,3})\]\[(\d{1,3})\]$/i;

export function parseLedEntry(text: string): LedEntry {
  const t = text.trim();
  if (t === "") return { kind: "blank" };
  if (t.startsWith("*")) return { kind: "disabled", inner: parseLedEntry(t.slice(1)) };
  const m = LED.exec(t);
  if (!m) return { kind: "unparsed" };
  return {
    kind: "led",
    indicator: m[1]!.toUpperCase() as Indicator,
    func: m[2]!,
    rgb: [Number(m[3]), Number(m[4]), Number(m[5])],
  };
}

export function parseLed(text: string): LedFile {
  const raw = splitLines(text);
  return { eol: dominantEol(raw), lines: raw.map((l) => ({ ...l, entry: parseLedEntry(l.text) })) };
}

export function serializeLed(file: LedFile): string {
  return joinLines(file.lines);
}

const LAYER_FUNCS = ["layd", "layk", "lay1", "lay2", "lay3"];

// One colour per function, except "layer": one line per layer, so its colours are keyed by lay* token.
export type EffectiveIndicator = { function: string; colors: Record<string, Rgb>; lines: number[] };

export function effectiveLeds(file: LedFile): Record<Indicator, EffectiveIndicator> {
  const blank = (): EffectiveIndicator => ({ function: "null", colors: {}, lines: [] });
  const out: Record<Indicator, EffectiveIndicator> = {
    IND1: blank(), IND2: blank(), IND3: blank(), IND4: blank(), IND5: blank(), IND6: blank(),
  };
  file.lines.forEach(({ entry }, index) => {
    if (entry.kind !== "led") return;
    const func = entry.func.toLowerCase();
    const ind = out[entry.indicator];
    if (LAYER_FUNCS.includes(func)) {
      if (ind.function !== "layer") Object.assign(ind, { function: "layer", colors: {}, lines: [] });
      ind.colors[func] = entry.rgb;
    } else {
      Object.assign(ind, { function: func, colors: { [func]: entry.rgb }, lines: [] });
    }
    ind.lines.push(index + 1);
  });
  return out;
}
