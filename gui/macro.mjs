// @ts-check
// A macro as a strip of strokes, and back to the tokens of a {trigger}>{tokens} line.

/**
 * @typedef {{ token: string, stroke: "tap" | "down" | "up" }} StripItem
 * @typedef {{ strip: StripItem[], speed: number | null, repeat: number | null }} Strip
 */

const PREFIX = { tap: "", down: "-", up: "+" };

/**
 * @param {StripItem} item
 */
function tokenOf(item) {
  return `${PREFIX[item.stroke]}${item.token}`;
}

/**
 * The --tokens value of set-macro: speed, then repeat, then the strokes.
 * @param {StripItem[]} strip
 * @param {number | null} speed
 * @param {number | null} repeat
 */
export function macroTokens(strip, speed, repeat) {
  const head = [
    speed === null ? "" : `s${speed}`,
    repeat === null ? "" : `x${repeat}`,
  ];

  return head
    .filter((t) => t !== "")
    .concat(strip.map(tokenOf))
    .map((t) => `{${t}}`)
    .join("");
}

/**
 * @param {string} token
 * @returns {StripItem}
 */
function stepOf(token) {
  if (token.length > 1 && token.startsWith("-")) {
    return { token: token.slice(1), stroke: "down" };
  }

  if (token.length > 1 && token.startsWith("+")) {
    return { token: token.slice(1), stroke: "up" };
  }

  return { token, stroke: "tap" };
}

/**
 * The strip a macro line plays; the first {sN} and {xN} become speed and repeat.
 * @param {readonly string[]} tokens
 * @returns {Strip}
 */
export function stripOf(tokens) {
  /** @type {Strip} */
  const out = { strip: [], speed: null, repeat: null };

  for (const token of tokens) {
    const setting = /^([sx])([1-9])$/.exec(token);

    if (setting?.[1] === "s" && out.speed === null) {
      out.speed = Number(setting[2]);
    } else if (setting?.[1] === "x" && out.repeat === null) {
      out.repeat = Number(setting[2]);
    } else {
      out.strip.push(stepOf(token));
    }
  }

  return out;
}

/** @type {Record<string, [string, string]>} */
const TYPED = {
  spc: [" ", " "],
  grav: ["`", "~"],
  hyph: ["-", "_"],
  eql: ["=", "+"],
  obrk: ["[", "{"],
  cbrk: ["]", "}"],
  bsls: ["\\", "|"],
  scol: [";", ":"],
  apos: ["'", '"'],
  comm: [",", "<"],
  perd: [".", ">"],
  fsls: ["/", "?"],
  1: ["1", "!"],
  2: ["2", "@"],
  3: ["3", "#"],
  4: ["4", "$"],
  5: ["5", "%"],
  6: ["6", "^"],
  7: ["7", "&"],
  8: ["8", "*"],
  9: ["9", "("],
  0: ["0", ")"],
};

const SHIFTS = new Set(["lshf", "rshf"]);

/**
 * What the strip types, Shift held or not; a stroke that types nothing shows as ‹token›.
 * @param {StripItem[]} strip
 */
export function macroPreview(strip) {
  let shift = false;
  let out = "";

  for (const { token, stroke } of strip) {
    const key = token.toLowerCase();

    if (SHIFTS.has(key) && stroke !== "tap") {
      shift = stroke === "down";
    } else if (/^[a-z]$/.test(key)) {
      out += shift ? key.toUpperCase() : key;
    } else {
      out += TYPED[key]?.[shift ? 1 : 0] ?? `‹${token}›`;
    }
  }

  return out;
}
