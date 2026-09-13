import { dominantEol, joinLines, splitLines, type Eol } from "./lines.ts";

export const LAYERS = ["base", "keypad", "function1", "function2", "function3"] as const;
export type LayerName = (typeof LAYERS)[number];

const LAYER_ALIASES: Record<string, LayerName> = {
  base: "base",
  kp: "keypad",
  keypad: "keypad",
  fn1: "function1",
  function1: "function1",
  fn2: "function2",
  function2: "function2",
  fn3: "function3",
  function3: "function3",
};

export function layerFromName(name: string): LayerName | null {
  return LAYER_ALIASES[name.toLowerCase()] ?? null;
}

export type Remap = { kind: "remap"; position: string; action: string };
export type TapHold = { kind: "taphold"; position: string; tap: string; ms: number; hold: string };
export type Macro = { kind: "macro"; trigger: string; cotrigger: string | null; tokens: string[] };
export type Entry =
  | { kind: "header"; layer: LayerName }
  | Remap
  | TapHold
  | Macro
  | { kind: "disabled"; inner: Entry }
  | { kind: "blank" }
  | { kind: "unparsed" };

export type LayoutLine = { raw: string; text: string; entry: Entry };
export type Layout = { lines: LayoutLine[]; eol: Eol };

const HEADER = /^<(\w+)>$/;
const REMAP = /^\[([^\[\]]+)\]>\[([^\[\]]+)\]$/;
const TAPHOLD = /^\[([^\[\]]+)\]>\[([^\[\]]+)\]\[t&h(\d{1,3})\]\[([^\[\]]+)\]$/i;
const MACRO = /^\{([^{}]+)\}(?:\{([^{}]+)\})?>((?:\{[^{}]+\})+)$/;

export function parseEntry(text: string): Entry {
  const t = text.trim();
  if (t === "") return { kind: "blank" };
  if (t.startsWith("*")) return { kind: "disabled", inner: parseEntry(t.slice(1)) };
  const header = HEADER.exec(t);
  if (header) {
    const layer = layerFromName(header[1]!);
    return layer ? { kind: "header", layer } : { kind: "unparsed" };
  }
  const taphold = TAPHOLD.exec(t);
  if (taphold) {
    return { kind: "taphold", position: taphold[1]!, tap: taphold[2]!, ms: Number(taphold[3]), hold: taphold[4]! };
  }
  const remap = REMAP.exec(t);
  if (remap) return { kind: "remap", position: remap[1]!, action: remap[2]! };
  const macro = MACRO.exec(t);
  if (macro) {
    // The guide writes the modifier co-trigger first: {lctr}{hk4}>{...}
    const [first, second] = [macro[1]!, macro[2]];
    const tokens = [...macro[3]!.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!);
    return second === undefined
      ? { kind: "macro", trigger: first, cotrigger: null, tokens }
      : { kind: "macro", trigger: second, cotrigger: first, tokens };
  }
  return { kind: "unparsed" };
}

export function parseLayout(text: string): Layout {
  const raw = splitLines(text);
  return { eol: dominantEol(raw), lines: raw.map((l) => ({ ...l, entry: parseEntry(l.text) })) };
}

export function serializeLayout(layout: Layout): string {
  return joinLines(layout.lines);
}

export type Located<E> = { line: number; entry: E };
export type EffectiveLayer = {
  keys: Map<string, Located<Remap | TapHold>>;
  macros: Map<string, Located<Macro>>;
};

export function macroKey(trigger: string, cotrigger: string | null): string {
  return `${trigger.toLowerCase()}+${cotrigger?.toLowerCase() ?? ""}`;
}

// Firmware rule: within a layer the line closest to the bottom wins; disabled lines do nothing.
export function effectiveLayer(layout: Layout, layer: LayerName): EffectiveLayer {
  const keys = new Map<string, Located<Remap | TapHold>>();
  const macros = new Map<string, Located<Macro>>();
  let current: LayerName | null = null;
  layout.lines.forEach(({ entry }, index) => {
    const line = index + 1;
    switch (entry.kind) {
      case "header":
        current = entry.layer;
        return;
      case "remap":
      case "taphold":
        if (current === layer) keys.set(entry.position.toLowerCase(), { line, entry });
        return;
      case "macro":
        if (current === layer) macros.set(macroKey(entry.trigger, entry.cotrigger), { line, entry });
        return;
      case "disabled":
      case "blank":
      case "unparsed":
        return;
      default:
        entry satisfies never;
    }
  });
  return { keys, macros };
}
