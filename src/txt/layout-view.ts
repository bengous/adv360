import { macroKey } from "./layout.ts";
import type { LayerName, Layout, Macro, Remap, TapHold } from "./layout.ts";

export type Located<E> = { line: number; entry: E };

export type EffectiveLayer = {
  keys: Map<string, Located<Remap | TapHold>>;
  macros: Map<string, Located<Macro>>;
};

// Firmware rule: within a layer the line closest to the bottom wins; disabled lines do nothing.
export function effectiveLayer(
  layout: Layout,
  layer: LayerName,
): EffectiveLayer {
  const keys = new Map<string, Located<Remap | TapHold>>();
  const macros = new Map<string, Located<Macro>>();
  let current: LayerName | null = null;

  for (const [index, { entry }] of layout.lines.entries()) {
    const line = index + 1;

    switch (entry.kind) {
      case "header":
        current = entry.layer;
        break;
      case "remap":
      case "taphold":
        if (current === layer) {
          keys.set(entry.position.toLowerCase(), { line, entry });
        }

        break;
      case "macro":
        if (current === layer) {
          macros.set(macroKey(entry.trigger, entry.cotrigger), { line, entry });
        }

        break;
      case "disabled":
      case "blank":
      case "unparsed":
        break;
      default:
        entry satisfies never;
    }
  }

  return { keys, macros };
}
