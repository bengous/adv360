// @ts-check
// Session edits as the change tray shows and replays them.

/**
 * @typedef {{ op: "set-remap", layer: string, position: string, action: string }
 *   | { op: "set-taphold", layer: string, position: string, tap: string, ms: number, hold: string }
 *   | { op: "set-macro", layer: string, trigger: string, cotrigger: string | null, tokens: readonly string[] }
 *   | { op: "remove", layer: string, position: string }
 *   | { op: "remove-macro", layer: string, trigger: string, cotrigger: string | null }
 *   | { op: "set-led", indicator: string, function: string, colors: Record<string, readonly number[]> }
 *   | { op: "replace-file", text: string }} Edit
 */

/**
 * @param {string | null} cotrigger
 * @returns {string[]}
 */
function cotriggerFlag(cotrigger) {
  return cotrigger === null ? [] : ["--cotrigger", cotrigger];
}

/** @param {{ layer: string, position: string }} e */
const at = (e) => ["--layer", e.layer, "--pos", e.position];

/** @param {{ layer: string, trigger: string, cotrigger: string | null }} e */
const trigger = (e) => [
  "--layer",
  e.layer,
  "--trigger",
  e.trigger,
  ...cotriggerFlag(e.cotrigger),
];

/**
 * @param {{ function: string, colors: Record<string, readonly number[]> }} edit
 * @returns {string[]}
 */
function ledColorFlags(edit) {
  const layered = edit.function === "layer";
  /** @type {string[]} */
  const flags = [];

  for (const key of Object.keys(edit.colors)) {
    flags.push(
      "--rgb",
      `${layered ? `${key}=` : ""}${(edit.colors[key] ?? []).join(",")}`,
    );
  }

  return flags;
}

/**
 * @param {Exclude<Edit, { op: "set-led" | "replace-file" }>} edit
 * @returns {string[]}
 */
function layerFlags(edit) {
  switch (edit.op) {
    case "set-remap":
      return [...at(edit), "--action", edit.action];
    case "set-taphold":
      return [
        ...at(edit),
        "--tap",
        edit.tap,
        "--ms",
        String(edit.ms),
        "--hold",
        edit.hold,
      ];
    case "set-macro":
      return [
        ...trigger(edit),
        "--tokens",
        edit.tokens.map((t) => `{${t}}`).join(""),
      ];
    case "remove":
      return at(edit);
    case "remove-macro":
      return trigger(edit);
    default: {
      /** @type {never} */
      const unknown = edit;

      throw new Error(`unknown edit ${JSON.stringify(unknown)}`);
    }
  }
}

/**
 * @param {Edit} edit
 * @returns {string[] | null}
 */
function flagsOf(edit) {
  if (edit.op === "replace-file") {
    return null;
  }

  if (edit.op === "set-led") {
    return [
      "--indicator",
      edit.indicator,
      "--func",
      edit.function,
      ...ledColorFlags(edit),
    ];
  }

  return layerFlags(edit);
}

/**
 * The CLI call that records `edit` again, for replaying a session; null for a restored file,
 * which only `restore` can open.
 * @param {Edit} edit
 * @param {number} profile
 * @returns {string[] | null}
 */
export function editArgs(edit, profile) {
  const flags = flagsOf(edit);
  const verb = edit.op === "remove-macro" ? "remove" : edit.op;

  return flags === null
    ? null
    : ["session", verb, "--profile", String(profile), ...flags];
}

/**
 * @param {Edit} edit
 * @param {number} index
 */
function groupOf(edit, index) {
  switch (edit.op) {
    case "set-remap":
    case "set-taphold":
    case "remove":
      return `${edit.layer}:${edit.position}`;
    case "set-macro":
    case "remove-macro":
      return `${edit.layer}:${edit.trigger}`;
    case "set-led":
      return `led:${edit.indicator}`;
    case "replace-file":
      return `file:${index}`;
    default: {
      /** @type {never} */
      const unknown = edit;

      throw new Error(`unknown edit ${JSON.stringify(unknown)}`);
    }
  }
}

/**
 * The edit that says what a key does after all of its edits: its action if set, else a
 * macro still standing, else the reset or removal that came last.
 * @param {[Edit, ...Edit[]]} group
 * @returns {Edit}
 */
function shown(group) {
  const actions = group.filter(
    (e) => e.op === "set-remap" || e.op === "set-taphold" || e.op === "remove",
  );

  const action = actions[actions.length - 1];

  if (action !== undefined && action.op !== "remove") {
    return action;
  }

  /** @type {Map<string, Edit>} */
  const macros = new Map();

  for (const e of group) {
    if (e.op === "set-macro" || e.op === "remove-macro") {
      macros.set(String(e.cotrigger), e);
    }
  }

  const standing = [...macros.values()].filter((e) => e.op === "set-macro");

  return standing[standing.length - 1] ?? action ?? group[0];
}

/**
 * One change per key or LED, in the order it was first edited: the indices of all its edits
 * (what a chip's × removes) and the edit that describes it now.
 * @param {readonly Edit[]} edits
 * @returns {{ indices: number[], show: Edit }[]}
 */
export function changes(edits) {
  /** @type {Map<string, { indices: number[], group: [Edit, ...Edit[]] }>} */
  const groups = new Map();

  for (const [i, edit] of edits.entries()) {
    const id = groupOf(edit, i);
    const found = groups.get(id);

    if (found === undefined) {
      groups.set(id, { indices: [i], group: [edit] });
    } else {
      found.indices.push(i);
      found.group.push(edit);
    }
  }

  return [...groups.values()].map(({ indices, group }) => ({
    indices,
    show: shown(group),
  }));
}
