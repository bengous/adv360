import { UsageError } from "../errors.ts";
import { parseLed, parseLedEntry, parseRgb } from "./led.ts";
import type { Indicator, LedFile, LedLine, Rgb } from "./led.ts";

export const LAYER_FUNCS = ["layd", "layk", "lay1", "lay2", "lay3"] as const;

export type LedColors = Record<string, Rgb>;

export type LedEdit =
  | { op: "set-led"; indicator: Indicator; function: string; colors: LedColors }
  | { op: "replace-file"; text: string };

// `--rgb R,G,B` colours the function itself; `--rgb layd=R,G,B` one layer of `--func layer`.
export function parseLedColors(
  specs: readonly string[],
  func: string,
): LedColors {
  const colors: LedColors = {};

  for (const spec of specs) {
    const eq = spec.indexOf("=");
    const key = eq === -1 ? func : spec.slice(0, eq).toLowerCase();
    colors[key] = parseRgb(eq === -1 ? spec : spec.slice(eq + 1));
  }

  if (Object.keys(colors).length === 0) {
    throw new UsageError(
      "--rgb is required (R,G,B, or layd=R,G,B ... for --func layer)",
    );
  }

  return colors;
}

export function renderLedLines(
  edit: Extract<LedEdit, { op: "set-led" }>,
): string[] {
  const funcs =
    edit.function === "layer"
      ? LAYER_FUNCS.filter((f) => f in edit.colors)
      : [edit.function];

  return funcs.flatMap((f) => {
    const rgb = edit.colors[f];

    return rgb === undefined
      ? []
      : [`[${edit.indicator}]>[${f}][${rgb[0]}][${rgb[1]}][${rgb[2]}]`];
  });
}

// The indicator's lines are replaced in place (first slot), extra lines dropped, else appended.
export function applyLedEdit(file: LedFile, edit: LedEdit): LedFile {
  if (edit.op === "replace-file") {
    return parseLed(edit.text);
  }

  const fresh = renderLedLines(edit).map((text): LedLine => ({
    raw: text + file.eol,
    text,
    entry: parseLedEntry(text),
  }));

  const lines: LedLine[] = [];
  let placed = false;

  for (const line of file.lines) {
    if (line.entry.kind === "led" && line.entry.indicator === edit.indicator) {
      if (!placed) {
        lines.push(...fresh);
      }

      placed = true;
    } else {
      lines.push(line);
    }
  }

  if (!placed) {
    const tail = lines.at(-1);

    if (tail && !tail.raw.endsWith("\n")) {
      lines[lines.length - 1] = { ...tail, raw: tail.raw + file.eol };
    }

    lines.push(...fresh);
  }

  return { ...file, lines };
}

// One colour per function, except "layer": one line per layer, so its colours are keyed by lay* token.
export type EffectiveIndicator = {
  function: string;
  colors: LedColors;
  lines: number[];
};

function blankIndicator(): EffectiveIndicator {
  return { function: "null", colors: {}, lines: [] };
}

export function effectiveLeds(
  file: LedFile,
): Record<Indicator, EffectiveIndicator> {
  const out: Record<Indicator, EffectiveIndicator> = {
    IND1: blankIndicator(),
    IND2: blankIndicator(),
    IND3: blankIndicator(),
    IND4: blankIndicator(),
    IND5: blankIndicator(),
    IND6: blankIndicator(),
  };

  for (const [index, { entry }] of file.lines.entries()) {
    if (entry.kind !== "led") {
      continue;
    }

    const func = entry.func.toLowerCase();
    const ind = out[entry.indicator];

    if (LAYER_FUNCS.some((f) => f === func)) {
      if (ind.function !== "layer") {
        Object.assign(ind, { function: "layer", colors: {}, lines: [] });
      }

      ind.colors[func] = entry.rgb;
    } else {
      Object.assign(ind, {
        function: func,
        colors: { [func]: entry.rgb },
        lines: [],
      });
    }

    ind.lines.push(index + 1);
  }

  return out;
}
