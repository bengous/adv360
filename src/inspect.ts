import { parseSettings } from "./settings.ts";
import {
  layoutRel,
  ledRel,
  listNamedBackups,
  PROFILES,
  readText,
  SETTINGS_REL,
} from "./source.ts";
import type { Profile } from "./source.ts";
import { parseLayout } from "./txt/layout.ts";
import type { Entry, LayerName } from "./txt/layout.ts";
import { parseLed } from "./txt/led.ts";
import type { LedEntry } from "./txt/led.ts";
import type { Eol } from "./txt/lines.ts";

type Warning = {
  warning: "unparsed" | "missing-layer-header";
  line: number;
  text: string;
};

type FileReport = {
  file: string;
  eol: "crlf" | "lf";
  entries: Record<string, unknown>[];
  warnings: Warning[];
};

export type InspectReport = {
  source: string;
  active_profile: number | null;
  firmware: { left: string | null; right: string | null };
  profiles: {
    profile: Profile;
    layout: FileReport | null;
    led: FileReport | null;
  }[];
  backups: string[];
};

const eolName = (eol: Eol) => (eol === "\r\n" ? "crlf" : "lf");

function layoutReport(file: string, text: string): FileReport {
  const layout = parseLayout(text);
  const entries: Record<string, unknown>[] = [];
  const warnings: Warning[] = [];
  let layer: LayerName | null = null;
  layout.lines.forEach(({ text, entry }, index) => {
    const line = index + 1;

    const describe = (e: Entry, disabled: boolean): void => {
      switch (e.kind) {
        case "header":
          layer = e.layer;
          entries.push({ line, kind: "header", layer: e.layer, disabled });

          return;
        case "remap":
        case "taphold":
        case "macro": {
          if (layer === null && !disabled) {
            warnings.push({ warning: "missing-layer-header", line, text });
          }

          const { kind, ...fields } = e;
          entries.push({ line, layer, kind, ...fields, disabled });

          return;
        }

        case "disabled":
          describe(e.inner, true);

          return;
        case "blank":
          return;
        case "unparsed":
          if (!disabled) {
            warnings.push({ warning: "unparsed", line, text });
          }

          return;
        default:
          e satisfies never;
      }
    };

    describe(entry, false);
  });

  return { file, eol: eolName(layout.eol), entries, warnings };
}

function ledReport(file: string, text: string): FileReport {
  const led = parseLed(text);
  const entries: Record<string, unknown>[] = [];
  const warnings: Warning[] = [];
  led.lines.forEach(({ text, entry }, index) => {
    const line = index + 1;

    const describe = (e: LedEntry, disabled: boolean): void => {
      switch (e.kind) {
        case "led":
          entries.push({
            line,
            kind: "led",
            indicator: e.indicator,
            func: e.func,
            rgb: e.rgb,
            disabled,
          });

          return;
        case "disabled":
          describe(e.inner, true);

          return;
        case "blank":
          return;
        case "unparsed":
          if (!disabled) {
            warnings.push({ warning: "unparsed", line, text });
          }

          return;
        default:
          e satisfies never;
      }
    };

    describe(entry, false);
  });

  return { file, eol: eolName(led.eol), entries, warnings };
}

export async function inspect(
  source: string,
  only?: Profile,
): Promise<InspectReport> {
  const settingsText = await readText(source, SETTINGS_REL);
  const settings = parseSettings(settingsText ?? "");
  const profiles = [];

  for (const profile of only ? [only] : PROFILES) {
    const layoutText = await readText(source, layoutRel(profile));
    const ledText = await readText(source, ledRel(profile));
    profiles.push({
      profile,
      layout:
        layoutText === null
          ? null
          : layoutReport(layoutRel(profile), layoutText),
      led: ledText === null ? null : ledReport(ledRel(profile), ledText),
    });
  }

  return {
    source,
    active_profile: settings.activeProfile,
    firmware: settings.firmware,
    profiles,
    backups: await listNamedBackups(source),
  };
}
