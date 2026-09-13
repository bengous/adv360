import type { Deps } from "../io/deps.ts";
import { readText } from "../io/disk.ts";
import { loadSession } from "../io/state.ts";
import { render } from "../model/session.ts";
import type { Session } from "../model/session.ts";
import { relOf } from "../model/source.ts";
import type { Profile, Source } from "../model/source.ts";
import type { LayerName } from "../model/txt/layout.ts";
import { effectiveLeds } from "../model/txt/led-edit.ts";
import type { EffectiveIndicator } from "../model/txt/led-edit.ts";
import { parseLed } from "../model/txt/led.ts";
import type { Indicator } from "../model/txt/led.ts";
import { layerKeys, overlay } from "../model/view-keys.ts";
import type { PendingKey } from "../model/view-keys.ts";

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
