import type {
  Entry,
  LayerName,
  Layout,
  LayoutLine,
  Macro,
  Remap,
  TapHold,
} from "./txt/layout.ts";
import type { Indicator, LedEntry, LedFile, LedLine, Rgb } from "./txt/led.ts";
import type { Eol } from "./txt/lines.ts";

export type Warning = {
  warning: "unparsed" | "missing-layer-header";
  line: number;
  text: string;
};

export type InspectEntry =
  | { line: number; kind: "header"; layer: LayerName; disabled: boolean }
  | ({ line: number; layer: LayerName | null } & (Remap | TapHold | Macro) & {
        disabled: boolean;
      })
  | {
      line: number;
      kind: "led";
      indicator: Indicator;
      func: string;
      rgb: Rgb;
      disabled: boolean;
    };

export type FileReport = {
  file: string;
  eol: "crlf" | "lf";
  entries: InspectEntry[];
  warnings: Warning[];
};

type Report = { entries: InspectEntry[]; warnings: Warning[] };

const eolName = (eol: Eol) => (eol === "\r\n" ? "crlf" : "lf");

function unwrapLayout(entry: Entry): { entry: Entry; disabled: boolean } {
  let e = entry;

  while (e.kind === "disabled") {
    e = e.inner;
  }

  return { entry: e, disabled: e !== entry };
}

function unwrapLed(entry: LedEntry): { entry: LedEntry; disabled: boolean } {
  let e = entry;

  while (e.kind === "disabled") {
    e = e.inner;
  }

  return { entry: e, disabled: e !== entry };
}

function describeLayoutLine(
  report: Report,
  layer: LayerName | null,
  line: number,
  { text, entry: raw }: LayoutLine,
): LayerName | null {
  const { entry, disabled } = unwrapLayout(raw);

  switch (entry.kind) {
    case "header":
      report.entries.push({
        line,
        kind: "header",
        layer: entry.layer,
        disabled,
      });

      return entry.layer;
    case "remap":
    case "taphold":
    case "macro":
      if (layer === null && !disabled) {
        report.warnings.push({ warning: "missing-layer-header", line, text });
      }

      report.entries.push({ line, layer, ...entry, disabled });

      return layer;
    case "unparsed":
      if (!disabled) {
        report.warnings.push({ warning: "unparsed", line, text });
      }

      return layer;
    case "blank":
    case "disabled":
      return layer;
    default:
      return entry satisfies never;
  }
}

export function layoutReport(file: string, layout: Layout): FileReport {
  const report: Report = { entries: [], warnings: [] };
  let layer: LayerName | null = null;

  for (const [index, line] of layout.lines.entries()) {
    layer = describeLayoutLine(report, layer, index + 1, line);
  }

  return { file, eol: eolName(layout.eol), ...report };
}

function describeLedLine(
  report: Report,
  line: number,
  { text, entry: raw }: LedLine,
): void {
  const { entry, disabled } = unwrapLed(raw);

  switch (entry.kind) {
    case "led":
      report.entries.push({
        line,
        kind: "led",
        indicator: entry.indicator,
        func: entry.func,
        rgb: entry.rgb,
        disabled,
      });
      break;
    case "unparsed":
      if (!disabled) {
        report.warnings.push({ warning: "unparsed", line, text });
      }

      break;
    case "blank":
    case "disabled":
      break;
    default:
      entry satisfies never;
  }
}

export function ledReport(file: string, led: LedFile): FileReport {
  const report: Report = { entries: [], warnings: [] };

  for (const [index, line] of led.lines.entries()) {
    describeLedLine(report, index + 1, line);
  }

  return { file, eol: eolName(led.eol), ...report };
}
