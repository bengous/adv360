import {
  BRACED,
  isMacroTokens,
  isTapHoldMs,
  layerFromName,
} from "./layout-values.ts";
import type { LayerName, MacroTokens, TapHoldMs } from "./layout-values.ts";
import { dominantEol, groups, joinLines, splitLines } from "./lines.ts";
import type { Eol } from "./lines.ts";

export type { LayerName, MacroTokens, TapHoldMs } from "./layout-values.ts";

export {
  isMacroTokens,
  isTapHoldMs,
  LAYERS,
  layerFromName,
  macroKey,
  parseLayerName,
  parseMacroTokens,
  parseTapHoldMs,
} from "./layout-values.ts";

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
