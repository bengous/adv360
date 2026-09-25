// @ts-check
// LED edits. set-led replaces every line of an indicator, so each call carries all its colours.

/** @type {Record<string, string>} */
export const LAYER_LEDS = {
  base: "layd",
  keypad: "layk",
  function1: "lay1",
  function2: "lay2",
  function3: "lay3",
};

const LAYER_KEYS = ["layd", "layk", "lay1", "lay2", "lay3"];

/**
 * @param {string} hex "#rrggbb" or "rrggbb"
 * @returns {number[]}
 */
export function rgbOf(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);

  if (m === null) {
    throw new Error(`not a #rrggbb colour: ${hex}`);
  }

  return [m[1], m[2], m[3]].map((part) => Number.parseInt(part ?? "0", 16));
}

/**
 * @param {readonly number[]} rgb
 */
export function hexOf(rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The colour of one function, or of the layer LED key: a missing one reads as off.
 * @param {Record<string, readonly number[]>} colors
 * @param {string} key
 * @returns {readonly number[]}
 */
function colorOf(colors, key) {
  return colors[key] ?? [0, 0, 0];
}

/**
 * The set-led call that gives `indicator` this function and these colours: a layer LED
 * sends its five layer colours, any other function one colour.
 * @param {number} profile
 * @param {string} indicator
 * @param {string} func
 * @param {Record<string, readonly number[]>} colors
 * @returns {string[]}
 */
export function ledArgs(profile, indicator, func, colors) {
  const head = [
    "session",
    "set-led",
    "--profile",
    String(profile),
    "--indicator",
    indicator,
    "--func",
    func,
  ];

  if (func !== "layer") {
    return [...head, "--rgb", colorOf(colors, func).join(",")];
  }

  /** @type {string[]} */
  const rgb = [];

  for (const key of LAYER_KEYS) {
    rgb.push("--rgb", `${key}=${colorOf(colors, key).join(",")}`);
  }

  return [...head, ...rgb];
}

/**
 * The colours after switching an LED to `func`. Switched to layer, every layer starts from
 * the colour the LED showed; switched to one function, it keeps the colour of the layer shown.
 * @param {{ function: string, colors: Record<string, readonly number[]> }} led
 * @param {string} func
 * @param {string} layerKey
 * @returns {Record<string, readonly number[]>}
 */
export function colorsFor(led, func, layerKey) {
  const was =
    led.function === "layer"
      ? colorOf(led.colors, layerKey)
      : colorOf(led.colors, led.function);

  if (func !== "layer") {
    return { [func]: was };
  }

  /** @type {Record<string, readonly number[]>} */
  const colors = {};

  for (const key of LAYER_KEYS) {
    colors[key] = led.function === "layer" ? colorOf(led.colors, key) : was;
  }

  return colors;
}
