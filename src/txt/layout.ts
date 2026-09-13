import type { Brand } from "../brand.ts";
import { UsageError } from "../errors.ts";
import { dominantEol, groups, joinLines, splitLines } from "./lines.ts";
import type { Eol } from "./lines.ts";

export const LAYERS = [
  "base",
  "keypad",
  "function1",
  "function2",
  "function3",
] as const;

export type LayerName = (typeof LAYERS)[number];

const LAYER_ALIASES = new Map<string, LayerName>([
  ["base", "base"],
  ["kp", "keypad"],
  ["keypad", "keypad"],
  ["fn1", "function1"],
  ["function1", "function1"],
  ["fn2", "function2"],
  ["function2", "function2"],
  ["fn3", "function3"],
  ["function3", "function3"],
]);

export function layerFromName(name: string): LayerName | null {
  return LAYER_ALIASES.get(name.toLowerCase()) ?? null;
}

export function parseLayerName(text: string): LayerName {
  const layer = layerFromName(text);

  if (layer === null) {
    throw new UsageError("--layer must be one of base kp fn1 fn2 fn3");
  }

  return layer;
}

export type TapHoldMs = Brand<number, "TapHoldMs">;

export function isTapHoldMs(n: number): n is TapHoldMs {
  return Number.isInteger(n) && n >= 1 && n <= 999;
}

export function parseTapHoldMs(text: string): TapHoldMs {
  const ms = Number(text);

  if (!isTapHoldMs(ms)) {
    throw new UsageError("--ms must be 1..999");
  }

  return ms;
}

export type MacroTokens = Brand<readonly string[], "MacroTokens">;

export function isMacroTokens(
  tokens: readonly string[],
): tokens is MacroTokens {
  return tokens.length > 0;
}

const BRACED = /(?<=\{)[^{}]+(?=\})/g;

export function parseMacroTokens(text: string): MacroTokens {
  const braced = text.match(BRACED) ?? [];

  const tokens =
    braced.length > 0 ? braced : text.split(/[\s,]+/).filter(Boolean);

  if (!isMacroTokens(tokens)) {
    throw new UsageError("--tokens needs at least one token");
  }

  return tokens;
}

export type Remap = { kind: "remap"; position: string; action: string };

export type TapHold = {
  kind: "taphold";
  position: string;
  tap: string;
  ms: TapHoldMs;
  hold: string;
};

export type Macro = {
  kind: "macro";
  trigger: string;
  cotrigger: string | null;
  tokens: MacroTokens;
};

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

const REMAP = /^\[([^[\]]+)\]>\[([^[\]]+)\]$/;

const TAPHOLD = /^\[([^[\]]+)\]>\[([^[\]]+)\]\[t&h(\d{1,3})\]\[([^[\]]+)\]$/i;

const MACRO = /^\{([^{}]+)\}(?:\{([^{}]+)\})?>((?:\{[^{}]+\})+)$/;

function parseHeader(text: string): Entry | null {
  const g = groups(HEADER, text, 1);

  if (g === null) {
    return null;
  }

  const layer = layerFromName(g[0]);

  return layer === null ? { kind: "unparsed" } : { kind: "header", layer };
}

function parseTapHold(text: string): TapHold | null {
  const g = groups(TAPHOLD, text, 4);

  if (g === null) {
    return null;
  }

  const [position, tap, msText, hold] = g;
  const ms = Number(msText);

  return isTapHoldMs(ms) ? { kind: "taphold", position, tap, ms, hold } : null;
}

function parseRemap(text: string): Remap | null {
  const g = groups(REMAP, text, 2);

  return g === null ? null : { kind: "remap", position: g[0], action: g[1] };
}

// The guide writes the modifier co-trigger first: {lctr}{hk4}>{...}
function parseMacro(text: string): Macro | null {
  const g = groups(MACRO, text, 3);

  if (g === null) {
    return null;
  }

  const [first, second, body] = g;
  const tokens = body.match(BRACED) ?? [];

  if (!isMacroTokens(tokens)) {
    return null;
  }

  return second === ""
    ? { kind: "macro", trigger: first, cotrigger: null, tokens }
    : { kind: "macro", trigger: second, cotrigger: first, tokens };
}

export function parseEntry(text: string): Entry {
  const t = text.trim();

  if (t === "") {
    return { kind: "blank" };
  }

  if (t.startsWith("*")) {
    return { kind: "disabled", inner: parseEntry(t.slice(1)) };
  }

  return (
    parseHeader(t) ??
    parseTapHold(t) ??
    parseRemap(t) ??
    parseMacro(t) ?? { kind: "unparsed" }
  );
}

export function parseLayout(text: string): Layout {
  const raw = splitLines(text);

  return {
    eol: dominantEol(raw),
    lines: raw.map(({ raw: line, text: t }) => ({
      raw: line,
      text: t,
      entry: parseEntry(t),
    })),
  };
}

export function serializeLayout(layout: Layout): string {
  return joinLines(layout.lines);
}

export function macroKey(trigger: string, cotrigger: string | null): string {
  return `${trigger.toLowerCase()}+${cotrigger?.toLowerCase() ?? ""}`;
}
