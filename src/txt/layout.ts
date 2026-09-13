import { dominantEol, joinLines, splitLines } from "./lines.ts";
import type { Eol } from "./lines.ts";

export const LAYERS = [
  "base",
  "keypad",
  "function1",
  "function2",
  "function3",
] as const;

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

export type TapHold = {
  kind: "taphold";
  position: string;
  tap: string;
  ms: number;
  hold: string;
};

export type Macro = {
  kind: "macro";
  trigger: string;
  cotrigger: string | null;
  tokens: string[];
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

export function parseEntry(text: string): Entry {
  const t = text.trim();

  if (t === "") {
    return { kind: "blank" };
  }

  if (t.startsWith("*")) {
    return { kind: "disabled", inner: parseEntry(t.slice(1)) };
  }

  const header = HEADER.exec(t);

  if (header) {
    const layer = layerFromName(header[1]!);

    return layer ? { kind: "header", layer } : { kind: "unparsed" };
  }

  const taphold = TAPHOLD.exec(t);

  if (taphold) {
    return {
      kind: "taphold",
      position: taphold[1]!,
      tap: taphold[2]!,
      ms: Number(taphold[3]),
      hold: taphold[4]!,
    };
  }

  const remap = REMAP.exec(t);

  if (remap) {
    return { kind: "remap", position: remap[1]!, action: remap[2]! };
  }

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

  return {
    eol: dominantEol(raw),
    lines: raw.map((l) => ({ ...l, entry: parseEntry(l.text) })),
  };
}

export function serializeLayout(layout: Layout): string {
  return joinLines(layout.lines);
}

export type LayoutEdit =
  | { op: "set-remap"; layer: LayerName; position: string; action: string }
  | {
      op: "set-taphold";
      layer: LayerName;
      position: string;
      tap: string;
      ms: number;
      hold: string;
    }
  | {
      op: "set-macro";
      layer: LayerName;
      trigger: string;
      cotrigger: string | null;
      tokens: string[];
    }
  | { op: "remove"; layer: LayerName; position: string }
  | {
      op: "remove-macro";
      layer: LayerName;
      trigger: string;
      cotrigger: string | null;
    }
  | { op: "replace-file"; text: string };

export function renderEntry(
  edit: Exclude<LayoutEdit, { op: "remove" | "remove-macro" | "replace-file" }>,
): string {
  switch (edit.op) {
    case "set-remap":
      return `[${edit.position}]>[${edit.action}]`;
    case "set-taphold":
      return `[${edit.position}]>[${edit.tap}][t&h${String(edit.ms).padStart(3, "0")}][${edit.hold}]`;
    case "set-macro":
      return `${edit.cotrigger ? `{${edit.cotrigger}}` : ""}{${edit.trigger}}>${edit.tokens.map((t) => `{${t}}`).join("")}`;
    default:
      return edit satisfies never;
  }
}

function layerOfLine(layout: Layout): (LayerName | null)[] {
  let current: LayerName | null = null;

  return layout.lines.map(({ entry }) =>
    entry.kind === "header" ? (current = entry.layer) : current,
  );
}

function eolOf(raw: string, fallback: Eol): string {
  return /\r?\n$/.exec(raw)?.[0] ?? fallback;
}

function makeLine(text: string, eol: string): LayoutLine {
  return { raw: text + eol, text, entry: parseEntry(text) };
}

function matches(entry: Entry, edit: LayoutEdit): boolean {
  switch (edit.op) {
    case "set-remap":
    case "set-taphold":
    case "remove":
      return (
        (entry.kind === "remap" || entry.kind === "taphold") &&
        entry.position.toLowerCase() === edit.position.toLowerCase()
      );
    case "set-macro":
    case "remove-macro":
      return (
        entry.kind === "macro" &&
        macroKey(entry.trigger, entry.cotrigger) ===
          macroKey(edit.trigger, edit.cotrigger)
      );
    case "replace-file":
      return false;
    default:
      return edit satisfies never;
  }
}

export class LayerMissing extends Error {
  constructor(readonly layer: LayerName) {
    super(`layer header <${layer}> is missing; the file is not repaired`);
  }
}

// Firmware rule: the last line wins, so an edit rewrites the last matching line of the layer
// or appends after the layer's last non-blank line. Every other byte of the file is kept.
export function applyLayoutEdit(layout: Layout, edit: LayoutEdit): Layout {
  if (edit.op === "replace-file") {
    return parseLayout(edit.text);
  }

  const layers = layerOfLine(layout);
  const inLayer = (i: number) => layers[i] === edit.layer;
  const lines = [...layout.lines];

  if (edit.op === "remove" || edit.op === "remove-macro") {
    return {
      ...layout,
      lines: lines.filter((l, i) => !(inLayer(i) && matches(l.entry, edit))),
    };
  }

  const text = renderEntry(edit);
  let last = -1;
  lines.forEach((l, i) => {
    if (inLayer(i) && matches(l.entry, edit)) {
      last = i;
    }
  });

  if (last >= 0) {
    lines[last] = makeLine(text, eolOf(lines[last]!.raw, layout.eol));

    return { ...layout, lines };
  }

  let end = -1;
  lines.forEach((l, i) => {
    if (inLayer(i) && l.entry.kind !== "blank") {
      end = i;
    }
  });

  if (end < 0) {
    throw new LayerMissing(edit.layer);
  }

  const tail = lines[end]!;

  if (!tail.raw.endsWith("\n")) {
    lines[end] = { ...tail, raw: tail.raw + layout.eol };
  }

  lines.splice(end + 1, 0, makeLine(text, layout.eol));

  return { ...layout, lines };
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
export function effectiveLayer(
  layout: Layout,
  layer: LayerName,
): EffectiveLayer {
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
        if (current === layer) {
          keys.set(entry.position.toLowerCase(), { line, entry });
        }

        return;
      case "macro":
        if (current === layer) {
          macros.set(macroKey(entry.trigger, entry.cotrigger), { line, entry });
        }

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
