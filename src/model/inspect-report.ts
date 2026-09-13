import type {
  LayerName,
  Layout,
  LayoutLine,
  Macro,
  Remap,
  TapHold,
} from "./txt/layout.ts";
import type { Indicator, LedFile, LedLine, Rgb } from "./txt/led.ts";
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

type At = { line: number; text: string; disabled: boolean };

type Unwrapped<E> = { entry: E; disabled: boolean };

const eolName = (eol: Eol) => (eol === "\r\n" ? "crlf" : "lf");

function unwrap<E extends { kind: string; inner?: E }>(entry: E): Unwrapped<E> {
  let e = entry;

  while (e.kind === "disabled" && e.inner !== undefined) {
    e = e.inner;
  }

  return { entry: e, disabled: e !== entry };
}

function pushUnparsed(report: Report, at: At): void {
  if (!at.disabled) {
    report.warnings.push({ warning: "unparsed", line: at.line, text: at.text });
  }
}

function pushKey(
  report: Report,
  layer: LayerName | null,
  at: At,
  entry: Remap | TapHold | Macro,
): void {
  if (layer === null && !at.disabled) {
    report.warnings.push({
      warning: "missing-layer-header",
      line: at.line,
      text: at.text,
    });
  }

  report.entries.push({
    line: at.line,
    layer,
    ...entry,
    disabled: at.disabled,
  });
}

function pushHeader(report: Report, at: At, layer: LayerName): void {
  report.entries.push({
    line: at.line,
    kind: "header",
    layer,
    disabled: at.disabled,
  });
}

function describeLayoutLine(
  report: Report,
  layer: LayerName | null,
  line: number,
  { text, entry: raw }: LayoutLine,
): LayerName | null {
  const { entry, disabled } = unwrap(raw);
  const at = { line, text, disabled };

  switch (entry.kind) {
    case "header":
      pushHeader(report, at, entry.layer);

      return entry.layer;
    case "remap":
    case "taphold":
    case "macro":
      pushKey(report, layer, at, entry);

      return layer;
    case "unparsed":
      pushUnparsed(report, at);

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
  const { entry, disabled } = unwrap(raw);

  switch (entry.kind) {
    case "led": {
      const { indicator, func, rgb } = entry;
      report.entries.push({
        line,
        kind: "led",
        indicator,
        func,
        rgb,
        disabled,
      });
      break;
    }

    case "unparsed":
      pushUnparsed(report, { line, text, disabled });
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
