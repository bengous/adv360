// @ts-check
// What tells profiles apart on the keyboard itself: the colour of the profile LED, and where Super is.

import { hexOf } from "./led.mjs";

const SUPER = new Set(["lwin", "rwin"]);

/**
 * @param {{ side: string, cluster: string }} key
 */
function placeOf(key) {
  if (key.cluster === "pedal") {
    return "pedal";
  }

  return `${key.side} ${key.cluster === "thumb" ? "thumb" : "hand"}`;
}

/**
 * @param {{ keys: { position: string, action: string }[], leds: Record<string, { function: string, colors: Record<string, number[]> }> | null }} view
 *   the `adv360 view` report of the base layer
 * @param {{ keys: { position: string, side: string, cluster: string }[] }} keyboard
 * @returns {{ dot: string, super: string }}
 */
export function profileHint(view, keyboard) {
  const leds = view.leds ?? {};

  const led = Object.keys(leds)
    .map((name) => leds[name])
    .find((l) => l?.function === "prof");

  const rgb = led === undefined ? undefined : led.colors["prof"];
  const dot = rgb === undefined || rgb.every((v) => v === 0) ? "" : hexOf(rgb);

  const places = view.keys
    .filter((k) => SUPER.has(k.action))
    .map((k) => keyboard.keys.find((b) => b.position === k.position))
    .filter((b) => b !== undefined)
    .map(placeOf);

  return {
    dot,
    super: places.length === 0 ? "no Super" : `Super: ${places.join(", ")}`,
  };
}
