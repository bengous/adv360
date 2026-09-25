// @ts-check
// What a change replaces: the key, macro or LED as `inspect` reads it on the keyboard.

/**
 * @typedef {import("./edits.mjs").Edit} Edit
 * @typedef {{ kind: string, layer?: string, position?: string, action?: string, tap?: string,
 *   ms?: number, hold?: string, trigger?: string, cotrigger?: string | null,
 *   tokens?: readonly string[], disabled: boolean }} LayoutEntry
 * @typedef {{ kind: string, indicator?: string, func?: string, rgb?: readonly number[], disabled: boolean }} LedEntry
 * @typedef {{ kind: "action", action: string | null }
 *   | { kind: "taphold", tap: string, ms: number, hold: string }
 *   | { kind: "macro", tokens: readonly string[] | null }
 *   | { kind: "led", function: string, colors: Record<string, readonly number[]> }
 *   | { kind: "file" }} Before
 */

/**
 * @template T
 * @param {readonly T[]} list
 * @param {(item: T) => boolean} keep
 * @returns {T | undefined}
 */
function lastOf(list, keep) {
  const hits = list.filter(keep);

  return hits[hits.length - 1];
}

/**
 * The line that sets a key: the last enabled one, as on the keyboard.
 * @param {string} layer
 * @param {string} position
 * @param {readonly LayoutEntry[]} entries
 */
function lineOf(layer, position, entries) {
  return lastOf(
    entries,
    (e) =>
      !e.disabled &&
      e.layer === layer &&
      (e.kind === "remap" || e.kind === "taphold") &&
      e.position?.toLowerCase() === position,
  );
}

/**
 * @param {string} layer
 * @param {string} position
 * @param {Record<string, Record<string, string>>} defaults
 * @returns {string | null}
 */
function factoryOf(layer, position, defaults) {
  return defaults[layer]?.[position] ?? defaults["base"]?.[position] ?? null;
}

/**
 * @param {string} layer
 * @param {string} position
 * @param {readonly LayoutEntry[]} entries
 * @param {Record<string, Record<string, string>>} defaults
 * @returns {Before}
 */
function actionBefore(layer, position, entries, defaults) {
  const hit = lineOf(layer, position, entries);

  if (hit === undefined) {
    return { kind: "action", action: factoryOf(layer, position, defaults) };
  }

  return hit.kind === "taphold"
    ? {
        kind: "taphold",
        tap: hit.tap ?? "",
        ms: hit.ms ?? 0,
        hold: hit.hold ?? "",
      }
    : { kind: "action", action: hit.action ?? null };
}

/**
 * @param {string} indicator
 * @param {readonly LedEntry[]} entries
 * @returns {Before}
 */
function ledBefore(indicator, entries) {
  const lines = entries.filter(
    (e) => e.kind === "led" && !e.disabled && e.indicator === indicator,
  );

  /** @type {Record<string, readonly number[]>} */
  const colors = {};

  for (const line of lines) {
    colors[line.func ?? ""] = line.rgb ?? [];
  }

  const first = lines[0]?.func ?? "null";

  return {
    kind: "led",
    function: first.startsWith("lay") ? "layer" : first,
    colors,
  };
}

/**
 * @param {Edit} edit
 * @param {{ layout: readonly LayoutEntry[], led: readonly LedEntry[] }} disk
 * @param {Record<string, Record<string, string>>} defaults
 * @returns {Before}
 */
export function beforeOf(edit, disk, defaults) {
  switch (edit.op) {
    case "set-remap":
    case "set-taphold":
    case "remove":
      return actionBefore(edit.layer, edit.position, disk.layout, defaults);
    case "set-macro":
    case "remove-macro": {
      const hit = lastOf(
        disk.layout,
        (e) =>
          !e.disabled &&
          e.kind === "macro" &&
          e.layer === edit.layer &&
          e.trigger?.toLowerCase() === edit.trigger &&
          (e.cotrigger ?? null) === edit.cotrigger,
      );

      return { kind: "macro", tokens: hit?.tokens ?? null };
    }

    case "set-led":
      return ledBefore(edit.indicator, disk.led);
    case "replace-file":
      return { kind: "file" };
    default: {
      /** @type {never} */
      const unknown = edit;

      throw new Error(`unknown edit ${JSON.stringify(unknown)}`);
    }
  }
}
