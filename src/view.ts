import keyboard from "../data/keyboard.json";
import tokens from "../data/tokens.json";
import { renderLayout, renderLed, type Session } from "./session.ts";
import { layoutRel, ledRel, readText, type Profile } from "./source.ts";
import { effectiveLayer, parseLayout, type LayerName } from "./txt/layout.ts";
import { effectiveLeds, parseLed, type EffectiveIndicator, type Indicator } from "./txt/led.ts";

const LABELS = new Map<string, string>();
for (const category of tokens.categories) {
  for (const [token, label] of Object.entries(category.tokens)) LABELS.set(token.toLowerCase(), label);
}

// An unknown token is shown raw, as the SmartSet App does.
export function labelOf(token: string): string {
  return LABELS.get(token.toLowerCase()) ?? token;
}

const DEFAULTS: Record<LayerName, Record<string, string>> = keyboard.defaults;

export function defaultAction(layer: LayerName, position: string): string | null {
  return DEFAULTS[layer][position] ?? DEFAULTS.base[position] ?? null;
}

export type ViewMacro = { cotrigger: string | null; tokens: string[]; line: number };
export type ViewKey =
  | { position: string; kind: "default"; action: string | null; label: string; macros: ViewMacro[] }
  | { position: string; kind: "remap"; action: string; label: string; line: number; macros: ViewMacro[] }
  | {
      position: string;
      kind: "taphold";
      tap: string;
      ms: number;
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

function layerKeys(text: string, layer: LayerName): ViewKey[] {
  const effective = effectiveLayer(parseLayout(text), layer);
  return keyboard.keys.map(({ position }): ViewKey => {
    const macros: ViewMacro[] = [];
    for (const { line, entry } of effective.macros.values()) {
      if (entry.trigger.toLowerCase() === position) macros.push({ cotrigger: entry.cotrigger, tokens: entry.tokens, line });
    }
    const hit = effective.keys.get(position);
    if (!hit) {
      const action = defaultAction(layer, position);
      return { position, kind: "default", action, label: action ? labelOf(action) : "", macros };
    }
    const { line, entry } = hit;
    if (entry.kind === "remap") return { position, kind: "remap", action: entry.action, label: labelOf(entry.action), line, macros };
    return {
      position,
      kind: "taphold",
      tap: entry.tap,
      ms: entry.ms,
      hold: entry.hold,
      label: `${labelOf(entry.tap)} / ${labelOf(entry.hold)}`,
      line,
      macros,
    };
  });
}

// With a session, keys show the pending render; `pending` marks the ones that differ from the disk.
export async function view(source: string, profile: Profile, layer: LayerName, session: Session | null = null): Promise<ViewReport> {
  const layoutText = await readText(source, layoutRel(profile));
  const ledText = await readText(source, ledRel(profile));
  const onDisk = layerKeys(layoutText ?? "", layer);
  const rendered = session ? renderLayout(session) : null;
  const shown = rendered === null ? onDisk : layerKeys(rendered, layer);
  const keys = shown.map((key, i) => ({ ...key, pending: JSON.stringify(key) !== JSON.stringify(onDisk[i]) }));
  const ledShown = session ? renderLed(session) : null;
  const leds = ledShown ?? ledText;
  return {
    profile,
    layer,
    layout: layoutText === null ? null : layoutRel(profile),
    keys,
    leds: leds === null ? null : effectiveLeds(parseLed(leds)),
    session: session !== null,
  };
}
