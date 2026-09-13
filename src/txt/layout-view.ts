import { macroKey } from "./layout.ts";
import type {
  Entry,
  LayerName,
  Layout,
  Macro,
  Remap,
  TapHold,
} from "./layout.ts";

export type Located<E> = { line: number; entry: E };

export type EffectiveLayer = {
  keys: Map<string, Located<Remap | TapHold>>;
  macros: Map<string, Located<Macro>>;
};

function collect(out: EffectiveLayer, line: number, entry: Entry): void {
  switch (entry.kind) {
    case "remap":
    case "taphold":
      out.keys.set(entry.position.toLowerCase(), { line, entry });
      break;
    case "macro":
      out.macros.set(macroKey(entry.trigger, entry.cotrigger), { line, entry });
      break;
    case "header":
    case "disabled":
    case "blank":
    case "unparsed":
      break;
    default:
      entry satisfies never;
  }
}

// Firmware rule: within a layer the line closest to the bottom wins; disabled lines do nothing.
export function effectiveLayer(
  layout: Layout,
  layer: LayerName,
): EffectiveLayer {
  const out: EffectiveLayer = { keys: new Map(), macros: new Map() };
  let current: LayerName | null = null;

  for (const [index, { entry }] of layout.lines.entries()) {
    if (entry.kind === "header") {
      current = entry.layer;
    } else if (current === layer) {
      collect(out, index + 1, entry);
    }
  }

  return out;
}
