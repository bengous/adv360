import { CliError } from "../errors.ts";
import { macroKey, parseEntry, parseLayout } from "./layout.ts";
import type {
  Entry,
  LayerName,
  Layout,
  LayoutLine,
  MacroTokens,
  TapHoldMs,
} from "./layout.ts";
import type { Eol } from "./lines.ts";

export type LayoutEdit =
  | { op: "set-remap"; layer: LayerName; position: string; action: string }
  | {
      op: "set-taphold";
      layer: LayerName;
      position: string;
      tap: string;
      ms: TapHoldMs;
      hold: string;
    }
  | {
      op: "set-macro";
      layer: LayerName;
      trigger: string;
      cotrigger: string | null;
      tokens: MacroTokens;
    }
  | { op: "remove"; layer: LayerName; position: string }
  | {
      op: "remove-macro";
      layer: LayerName;
      trigger: string;
      cotrigger: string | null;
    }
  | { op: "replace-file"; text: string };

type SetEdit = Extract<
  LayoutEdit,
  { op: "set-remap" | "set-taphold" | "set-macro" }
>;

type LayerEdit = Exclude<LayoutEdit, { op: "replace-file" }>;

export class LayerMissing extends CliError {
  constructor(readonly layer: LayerName) {
    super(
      "layer-missing",
      `layer header <${layer}> is missing; the file is not repaired`,
      { layer },
    );
  }
}

export function renderEntry(edit: SetEdit): string {
  switch (edit.op) {
    case "set-remap":
      return `[${edit.position}]>[${edit.action}]`;
    case "set-taphold":
      return `[${edit.position}]>[${edit.tap}][t&h${String(edit.ms).padStart(3, "0")}][${edit.hold}]`;
    case "set-macro":
      return `${edit.cotrigger !== null && edit.cotrigger !== "" ? `{${edit.cotrigger}}` : ""}{${edit.trigger}}>${edit.tokens.map((t) => `{${t}}`).join("")}`;
    default:
      return edit satisfies never;
  }
}

function inLayer(layout: Layout, layer: LayerName): boolean[] {
  let current: LayerName | null = null;

  return layout.lines.map(({ entry }) => {
    if (entry.kind === "header") {
      current = entry.layer;
    }

    return current === layer;
  });
}

function eolOf(raw: string, fallback: Eol): string {
  return /\r?\n$/.exec(raw)?.[0] ?? fallback;
}

function makeLine(text: string, eol: string): LayoutLine {
  return { raw: text + eol, text, entry: parseEntry(text) };
}

function matches(entry: Entry, edit: LayerEdit): boolean {
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
    default:
      return edit satisfies never;
  }
}

function removeMatching(
  layout: Layout,
  edit: LayerEdit,
  inside: boolean[],
): Layout {
  return {
    ...layout,
    lines: layout.lines.filter(
      (l, i) => !(inside[i] === true && matches(l.entry, edit)),
    ),
  };
}

function rewriteLast(layout: Layout, index: number, text: string): Layout {
  const lines = [...layout.lines];
  const eol = eolOf(lines[index]?.raw ?? "", layout.eol);
  lines[index] = makeLine(text, eol);

  return { ...layout, lines };
}

function appendToLayer(
  layout: Layout,
  edit: SetEdit,
  inside: boolean[],
): Layout {
  const lines = [...layout.lines];

  const end = lines.findLastIndex(
    (l, i) => inside[i] === true && l.entry.kind !== "blank",
  );

  const tail = lines[end];

  if (tail === undefined) {
    throw new LayerMissing(edit.layer);
  }

  if (!tail.raw.endsWith("\n")) {
    lines[end] = { ...tail, raw: tail.raw + layout.eol };
  }

  lines.splice(end + 1, 0, makeLine(renderEntry(edit), layout.eol));

  return { ...layout, lines };
}

// Firmware rule: the last line wins, so an edit rewrites the last matching line of the layer
// or appends after the layer's last non-blank line. Every other byte of the file is kept.
export function applyLayoutEdit(layout: Layout, edit: LayoutEdit): Layout {
  if (edit.op === "replace-file") {
    return parseLayout(edit.text);
  }

  const inside = inLayer(layout, edit.layer);

  if (edit.op === "remove" || edit.op === "remove-macro") {
    return removeMatching(layout, edit, inside);
  }

  const last = layout.lines.findLastIndex(
    (l, i) => inside[i] === true && matches(l.entry, edit),
  );

  return last >= 0
    ? rewriteLast(layout, last, renderEntry(edit))
    : appendToLayer(layout, edit, inside);
}
