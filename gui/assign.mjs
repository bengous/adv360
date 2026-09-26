// @ts-check
// Action tokens as the GUI shows and assigns them. Tokens stay opaque strings: nothing
// here refuses one, it only tells whether data/tokens.json knows it.

/**
 * @typedef {{ categories: { name: string, tokens: Record<string, string> }[] }} TokensJson
 * @typedef {{ cotrigger: string | null, tokens: readonly string[] }} ViewMacro
 * @typedef {{ position: string, kind: "default" | "remap", action: string | null, macros: readonly ViewMacro[] }
 *   | { position: string, kind: "taphold", tap: string, ms: number, hold: string, macros: readonly ViewMacro[] }} ViewKey
 */

/**
 * The label of every known action, keyed by its lower-case token.
 * @param {TokensJson} tokens
 * @returns {Record<string, string>}
 */
export function labels(tokens) {
  /** @type {Record<string, string>} */
  const out = {};

  for (const category of tokens.categories) {
    for (const token of Object.keys(category.tokens)) {
      out[token.toLowerCase()] = category.tokens[token] ?? token;
    }
  }

  return out;
}

/**
 * @param {string} token
 * @param {TokensJson} tokens
 */
export function isKnown(token, tokens) {
  const wanted = token.toLowerCase();

  return tokens.categories.some((c) =>
    Object.keys(c.tokens).some((t) => t.toLowerCase() === wanted),
  );
}

/**
 * What a position is called: its factory action on the base layer, or its hotkey number.
 * @param {string} position
 * @param {Record<string, string>} baseDefaults
 * @param {Record<string, string>} labelMap
 */
export function keyName(position, baseDefaults, labelMap) {
  if (position.startsWith("hk")) {
    return `Hotkey ${position.slice(2)}`;
  }

  if (position === "pedl") {
    return "Pedal";
  }

  const action = baseDefaults[position];

  return action === undefined ? position : (labelMap[action] ?? action);
}

/**
 * The action a key performs when tapped: what a copy onto a single slot takes.
 * @param {ViewKey} key
 * @returns {string | null}
 */
export function actionOf(key) {
  return key.kind === "taphold" ? key.tap : key.action;
}

/**
 * The session edit that gives `target` the effective action of `source` on the layer shown.
 * A tap-and-hold source copies tap, hold and delay; a macro on the source stays behind.
 * @param {ViewKey} source
 * @param {string} target
 * @param {string} layer
 * @param {number} profile
 * @returns {string[] | null}
 */
export function copyArgs(source, target, layer, profile) {
  const at = ["--profile", String(profile), "--layer", layer, "--pos", target];

  if (source.kind === "taphold") {
    return [
      "session",
      "set-taphold",
      ...at,
      "--tap",
      source.tap,
      "--ms",
      String(source.ms),
      "--hold",
      source.hold,
    ];
  }

  return source.action === null || source.action === ""
    ? null
    : ["session", "set-remap", ...at, "--action", source.action];
}

/**
 * The keys of a layer as the factory sets them, shaped like the keys of `adv360 view`:
 * what the drawn keyboard shows while the v-Drive is closed and `view` cannot read it.
 * @param {{ keys: readonly { position: string }[], defaults: Record<string, Record<string, string>> }} keyboard
 * @param {Record<string, string>} labelMap
 * @param {string} layer
 */
export function factoryKeys(keyboard, labelMap, layer) {
  const layerDefaults = keyboard.defaults[layer] ?? {};

  return keyboard.keys.map(({ position }) => {
    const action =
      layerDefaults[position] ?? keyboard.defaults["base"]?.[position] ?? null;

    const label =
      action === null || action === ""
        ? ""
        : (labelMap[action.toLowerCase()] ?? action);

    return {
      position,
      kind: /** @type {const} */ ("default"),
      action,
      label,
      macros: /** @type {ViewMacro[]} */ ([]),
      pending: false,
    };
  });
}
