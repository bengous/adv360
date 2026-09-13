import { badJson, field } from "./decode.ts";
import { isArray, isNumber, isObject, isString, orNull } from "./json.ts";
import type { Is, Json, JsonObject } from "./json.ts";
import type { Session } from "./session.ts";
import { parseProfile } from "./source.ts";
import type { LayoutEdit } from "./txt/layout-edit.ts";
import { isMacroTokens, isTapHoldMs, LAYERS } from "./txt/layout.ts";
import type { LayerName, MacroTokens, TapHoldMs } from "./txt/layout.ts";
import type { LedColors, LedEdit } from "./txt/led-edit.ts";
import { INDICATORS, isRgb } from "./txt/led.ts";
import type { Indicator, Rgb } from "./txt/led.ts";

const WHAT = "session file";

const isLayer: Is<LayerName> = (v): v is LayerName =>
  LAYERS.some((layer) => layer === v);

const isIndicator: Is<Indicator> = (v): v is Indicator =>
  INDICATORS.some((indicator) => indicator === v);

const isMs: Is<TapHoldMs> = (v): v is TapHoldMs =>
  isNumber(v) && isTapHoldMs(v);

const isTokens: Is<MacroTokens> = (v): v is MacroTokens =>
  isArray(v) && v.every(isString) && isMacroTokens(v);

const isColor: Is<Rgb> = (v): v is Rgb =>
  isArray(v) && v.every(isNumber) && isRgb(v);

function str(object: JsonObject, key: string): string {
  return field(object, key, isString, WHAT);
}

function parseLayoutEdit(value: Json): LayoutEdit {
  if (!isObject(value)) {
    throw badJson(WHAT, "edits holds a non-object");
  }

  const op = str(value, "op");

  switch (op) {
    case "set-remap":
      return {
        op,
        layer: field(value, "layer", isLayer, WHAT),
        position: str(value, "position"),
        action: str(value, "action"),
      };
    case "remove":
      return {
        op,
        layer: field(value, "layer", isLayer, WHAT),
        position: str(value, "position"),
      };
    case "set-taphold":
      return {
        op,
        layer: field(value, "layer", isLayer, WHAT),
        position: str(value, "position"),
        tap: str(value, "tap"),
        ms: field(value, "ms", isMs, WHAT),
        hold: str(value, "hold"),
      };
    case "set-macro":
      return {
        op,
        layer: field(value, "layer", isLayer, WHAT),
        trigger: str(value, "trigger"),
        cotrigger: field(value, "cotrigger", orNull(isString), WHAT),
        tokens: field(value, "tokens", isTokens, WHAT),
      };
    case "remove-macro":
      return {
        op,
        layer: field(value, "layer", isLayer, WHAT),
        trigger: str(value, "trigger"),
        cotrigger: field(value, "cotrigger", orNull(isString), WHAT),
      };
    case "replace-file":
      return { op, text: str(value, "text") };
    default:
      throw badJson(WHAT, `edit op is ${op}`);
  }
}

function parseColors(object: JsonObject): LedColors {
  const colors: LedColors = {};

  for (const key of Object.keys(object)) {
    colors[key] = field(object, key, isColor, WHAT);
  }

  return colors;
}

function parseLedEdit(value: Json): LedEdit {
  if (!isObject(value)) {
    throw badJson(WHAT, "edits holds a non-object");
  }

  const op = str(value, "op");

  switch (op) {
    case "set-led":
      return {
        op,
        indicator: field(value, "indicator", isIndicator, WHAT),
        function: str(value, "function"),
        colors: parseColors(field(value, "colors", isObject, WHAT)),
      };
    case "replace-file":
      return { op, text: str(value, "text") };
    default:
      throw badJson(WHAT, `edit op is ${op}`);
  }
}

function parsePart<E>(
  value: Json | undefined,
  parseEdit: (edit: Json) => E,
): { baseText: string; edits: E[] } | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isObject(value)) {
    throw badJson(WHAT, "a part is not an object");
  }

  return {
    baseText: str(value, "baseText"),
    edits: field(value, "edits", isArray, WHAT).map(parseEdit),
  };
}

export function parseSession(object: JsonObject): Session {
  const session: Session = {
    profile: parseProfile(String(field(object, "profile", isNumber, WHAT))),
  };

  const layout = parsePart(object["layout"], parseLayoutEdit);
  const led = parsePart(object["led"], parseLedEdit);

  if (layout !== undefined) {
    session.layout = layout;
  }

  if (led !== undefined) {
    session.led = led;
  }

  return session;
}
