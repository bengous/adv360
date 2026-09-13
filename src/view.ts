import type { Deps } from "./deps.ts";
import { readText } from "./disk.ts";
import { render } from "./session.ts";
import type { Session } from "./session.ts";
import { relOf } from "./source.ts";
import type { Profile, Source } from "./source.ts";
import { loadSession } from "./state.ts";
import type { LayerName } from "./txt/layout.ts";
import { effectiveLeds } from "./txt/led-edit.ts";
import type { EffectiveIndicator } from "./txt/led-edit.ts";
import { parseLed } from "./txt/led.ts";
import type { Indicator } from "./txt/led.ts";
import { layerKeys, overlay } from "./view-keys.ts";
import type { PendingKey } from "./view-keys.ts";

export type ViewReport = {
  profile: Profile;
  layer: LayerName;
  layout: string | null;
  keys: PendingKey[];
  leds: Record<Indicator, EffectiveIndicator> | null;
  session: boolean;
};

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

export async function viewSession(
  deps: Deps,
  source: Source,
  profile: Profile,
  layer: LayerName,
): Promise<ViewReport> {
  return view(
    source.dir,
    profile,
    layer,
    await loadSession(deps.stateDir, profile),
  );
}
