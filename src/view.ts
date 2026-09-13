import keyboard from "../data/keyboard.json";
import tokens from "../data/tokens.json";
import { readText } from "./disk.ts";
import { render } from "./session.ts";
import type { Session } from "./session.ts";
import { relOf } from "./source.ts";
import type { Profile } from "./source.ts";
import { effectiveLayer } from "./txt/layout-view.ts";
import type { EffectiveLayer } from "./txt/layout-view.ts";
import { parseLayout } from "./txt/layout.ts";
import type { LayerName, MacroTokens, TapHoldMs } from "./txt/layout.ts";
import { effectiveLeds } from "./txt/led-edit.ts";
import type { EffectiveIndicator } from "./txt/led-edit.ts";
import { parseLed } from "./txt/led.ts";
import type { Indicator } from "./txt/led.ts";

const LABELS = new Map<string, string>();

for (const category of tokens.categories) {
  for (const [token, label] of Object.entries(category.tokens)) {
    LABELS.set(token.toLowerCase(), label);
  }
}

// An unknown token is shown raw, as the SmartSet App does.
export function labelOf(token: string): string {
  return LABELS.get(token.toLowerCase()) ?? token;
}

const DEFAULTS: Record<LayerName, Record<string, string>> = keyboard.defaults;

export function defaultAction(
  layer: LayerName,
  position: string,
): string | null {
  return DEFAULTS[layer][position] ?? DEFAULTS.base[position] ?? null;
}

export type ViewMacro = {
  cotrigger: string | null;
  tokens: MacroTokens;
  line: number;
};

export type ViewKey =
  | {
      position: string;
      kind: "default";
      action: string | null;
      label: string;
      macros: ViewMacro[];
    }
  | {
      position: string;
      kind: "remap";
      action: string;
      label: string;
      line: number;
      macros: ViewMacro[];
    }
  | {
      position: string;
      kind: "taphold";
      tap: string;
      ms: TapHoldMs;
      hold: string;
      label: string;
      line: number;
      macros: ViewMacro[];
    };

export type ViewReport = {
  profile: Profile;
  layer: LayerName;
  layout: string | null;
  keys: (ViewKey & { pending: boolean })[];
  leds: Record<Indicator, EffectiveIndicator> | null;
  session: boolean;
};

function macrosOf(effective: EffectiveLayer, position: string): ViewMacro[] {
  const macros: ViewMacro[] = [];

  for (const { line, entry } of effective.macros.values()) {
    if (entry.trigger.toLowerCase() === position) {
      macros.push({ cotrigger: entry.cotrigger, tokens: entry.tokens, line });
    }
  }

  return macros;
}

function keyOf(
  effective: EffectiveLayer,
  layer: LayerName,
  position: string,
): ViewKey {
  const macros = macrosOf(effective, position);
  const hit = effective.keys.get(position);

  if (!hit) {
    const action = defaultAction(layer, position);
    const label = action !== null && action !== "" ? labelOf(action) : "";

    return { position, kind: "default", action, label, macros };
  }

  const { line, entry } = hit;

  if (entry.kind === "remap") {
    const label = labelOf(entry.action);

    return {
      position,
      kind: "remap",
      action: entry.action,
      label,
      line,
      macros,
    };
  }

  const label = `${labelOf(entry.tap)} / ${labelOf(entry.hold)}`;
  const { tap, ms, hold } = entry;

  return { position, kind: "taphold", tap, ms, hold, label, line, macros };
}

export function layerKeys(text: string, layer: LayerName): ViewKey[] {
  const effective = effectiveLayer(parseLayout(text), layer);

  return keyboard.keys.map(({ position }) => keyOf(effective, layer, position));
}

// With a session, keys show the pending render; `pending` marks the ones that differ from the disk.
export function overlay(
  onDisk: ViewKey[],
  shown: ViewKey[],
): ViewReport["keys"] {
  const keys: ViewReport["keys"] = [];

  for (const [i, key] of shown.entries()) {
    keys.push({
      ...key,
      pending: JSON.stringify(key) !== JSON.stringify(onDisk[i]),
    });
  }

  return keys;
}

export async function view(
  source: string,
  profile: Profile,
  layer: LayerName,
  session: Session | null = null,
): Promise<ViewReport> {
  const layoutText = await readText(source, relOf("layout", profile));
  const ledText = await readText(source, relOf("led", profile));
  const onDisk = layerKeys(layoutText ?? "", layer);
  const rendered = session ? render(session, "layout") : null;
  const shown = rendered === null ? onDisk : layerKeys(rendered, layer);
  const ledShown = session ? render(session, "led") : null;
  const leds = ledShown ?? ledText;

  return {
    profile,
    layer,
    layout: layoutText === null ? null : relOf("layout", profile),
    keys: overlay(onDisk, shown),
    leds: leds === null ? null : effectiveLeds(parseLed(leds)),
    session: session !== null,
  };
}
