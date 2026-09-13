import { listNamedBackups, readText } from "../io/disk.ts";
import { layoutReport, ledReport } from "../model/inspect-report.ts";
import type { FileReport } from "../model/inspect-report.ts";
import { parseSettings } from "../model/settings.ts";
import { PROFILES, relOf, SETTINGS_REL } from "../model/source.ts";
import type { Profile } from "../model/source.ts";
import { parseLayout } from "../model/txt/layout.ts";
import { parseLed } from "../model/txt/led.ts";

export type ProfileReport = {
  profile: Profile;
  layout: FileReport | null;
  led: FileReport | null;
};

export type InspectReport = {
  source: string;
  active_profile: number | null;
  firmware: { left: string | null; right: string | null };
  profiles: ProfileReport[];
  backups: string[];
};

async function profileReport(
  source: string,
  profile: Profile,
): Promise<ProfileReport> {
  const layoutFile = relOf("layout", profile);
  const ledFile = relOf("led", profile);
  const layoutText = await readText(source, layoutFile);
  const ledText = await readText(source, ledFile);

  return {
    profile,
    layout:
      layoutText === null
        ? null
        : layoutReport(layoutFile, parseLayout(layoutText)),
    led: ledText === null ? null : ledReport(ledFile, parseLed(ledText)),
  };
}

export async function inspect(
  source: string,
  only?: Profile,
): Promise<InspectReport> {
  const settingsText = await readText(source, SETTINGS_REL);
  const settings = parseSettings(settingsText ?? "");
  const profiles: ProfileReport[] = [];

  for (const profile of only ? [only] : PROFILES) {
    profiles.push(await profileReport(source, profile));
  }

  return {
    source,
    active_profile: settings.activeProfile,
    firmware: settings.firmware,
    profiles,
    backups: await listNamedBackups(source),
  };
}
