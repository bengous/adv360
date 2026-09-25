// @ts-check
// "Press a key": the physical key pressed, turned into the token of data/tokens.json.

const QT = {
  escape: 0x01000000,
  tab: 0x01000001,
  backtab: 0x01000002,
  backspace: 0x01000003,
  f1: 0x01000030,
  f24: 0x01000047,
  shift: 0x01000020,
  control: 0x01000021,
  meta: 0x01000022,
  alt: 0x01000023,
  superLeft: 0x01000053,
  superRight: 0x01000054,
  altGr: 0x01001103,
};

/** @type {Record<number, string>} */
const NAMED = {
  [QT.escape]: "esc",
  [QT.tab]: "tab",
  [QT.backtab]: "tab",
  [QT.backspace]: "bspc",
  0x01000004: "ent",
  0x01000005: "kpen",
  0x01000006: "ins",
  0x01000007: "del",
  0x01000008: "paus",
  0x01000009: "prnt",
  0x01000010: "home",
  0x01000011: "end",
  0x01000012: "left",
  0x01000013: "up",
  0x01000014: "rght",
  0x01000015: "down",
  0x01000016: "pgup",
  0x01000017: "pgdn",
  0x01000024: "caps",
  0x01000025: "nmlk",
  0x01000026: "sclk",
  0x01000055: "app",
};

// XKB keycodes (evdev + 8): the only way to tell a left modifier from a right one.
/** @type {Record<number, string>} */
const MODIFIER_SCANCODES = {
  50: "lshf",
  62: "rshf",
  37: "lctr",
  105: "rctr",
  64: "lalt",
  108: "ralt",
  133: "lwin",
  134: "rwin",
};

const MODIFIERS = new Set([
  QT.shift,
  QT.control,
  QT.meta,
  QT.alt,
  QT.superLeft,
  QT.superRight,
  QT.altGr,
]);

/** @type {Record<string, string>} */
const PRINTABLE = {
  " ": "spc",
  "`": "grav",
  "~": "grav",
  "-": "hyph",
  _: "hyph",
  "=": "eql",
  "+": "eql",
  "[": "obrk",
  "{": "obrk",
  "]": "cbrk",
  "}": "cbrk",
  "\\": "bsls",
  "|": "bsls",
  ";": "scol",
  ":": "scol",
  "'": "apos",
  '"': "apos",
  ",": "comm",
  "<": "comm",
  ".": "perd",
  ">": "perd",
  "/": "fsls",
  "?": "fsls",
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
};

/**
 * The token of a physical key pressed in "Press a key" mode, or null when it has none.
 * @param {number} qtKey
 * @param {number} nativeScanCode
 * @param {string} text
 * @returns {string | null}
 */
export function tokenForKey(qtKey, nativeScanCode, text) {
  if (qtKey >= QT.f1 && qtKey <= QT.f24) {
    return `f${qtKey - QT.f1 + 1}`;
  }

  if (MODIFIERS.has(qtKey)) {
    return MODIFIER_SCANCODES[nativeScanCode] ?? null;
  }

  const named = NAMED[qtKey];

  if (named !== undefined) {
    return named;
  }

  const lower = text.toLowerCase();

  return /^[a-z0-9]$/.test(lower) ? lower : (PRINTABLE[text] ?? null);
}
