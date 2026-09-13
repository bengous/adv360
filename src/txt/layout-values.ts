import type { Brand } from "../brand.ts";
import { UsageError } from "../errors.ts";

export const LAYERS = [
  "base",
  "keypad",
  "function1",
  "function2",
  "function3",
] as const;

export type LayerName = (typeof LAYERS)[number];

const LAYER_ALIASES = new Map<string, LayerName>([
  ["base", "base"],
  ["kp", "keypad"],
  ["keypad", "keypad"],
  ["fn1", "function1"],
  ["function1", "function1"],
  ["fn2", "function2"],
  ["function2", "function2"],
  ["fn3", "function3"],
  ["function3", "function3"],
]);

export function layerFromName(name: string): LayerName | null {
  return LAYER_ALIASES.get(name.toLowerCase()) ?? null;
}

export function parseLayerName(text: string): LayerName {
  const layer = layerFromName(text);

  if (layer === null) {
    throw new UsageError("--layer must be one of base kp fn1 fn2 fn3");
  }

  return layer;
}

export type TapHoldMs = Brand<number, "TapHoldMs">;

export function isTapHoldMs(n: number): n is TapHoldMs {
  return Number.isInteger(n) && n >= 1 && n <= 999;
}

export function parseTapHoldMs(text: string): TapHoldMs {
  const ms = Number(text);

  if (!isTapHoldMs(ms)) {
    throw new UsageError("--ms must be 1..999");
  }

  return ms;
}

export type MacroTokens = Brand<readonly string[], "MacroTokens">;

export function isMacroTokens(
  tokens: readonly string[],
): tokens is MacroTokens {
  return tokens.length > 0;
}

export const BRACED = /(?<=\{)[^{}]+(?=\})/g;

export function parseMacroTokens(text: string): MacroTokens {
  const braced = text.match(BRACED) ?? [];

  const tokens =
    braced.length > 0 ? braced : text.split(/[\s,]+/).filter(Boolean);

  if (!isMacroTokens(tokens)) {
    throw new UsageError("--tokens needs at least one token");
  }

  return tokens;
}

export function macroKey(trigger: string, cotrigger: string | null): string {
  return `${trigger.toLowerCase()}+${cotrigger?.toLowerCase() ?? ""}`;
}
