// @ts-check
// The legend printed on a drawn cap: split at a word, sized to fit.

/**
 * Two lines as even as possible, split at a space or after a "+", never inside a word.
 * @param {string} label
 * @returns {string[]}
 */
function split(label) {
  const pieces = label.match(/[^ +]+\+?|\s+/g) ?? [label];
  let best = [label];

  for (let i = 1; i < pieces.length; i++) {
    const a = pieces.slice(0, i).join("").trim();
    const b = pieces.slice(i).join("").trim();

    if (
      a !== "" &&
      b !== "" &&
      Math.max(a.length, b.length) < Math.max(...best.map((l) => l.length))
    ) {
      best = [a, b];
    }
  }

  return best;
}

/**
 * @param {string} label
 * @param {string} position
 * @returns {{ lines: string[], muted: boolean }}
 */
export function legend(label, position) {
  if (label === "" && position.startsWith("hk")) {
    return { lines: [`Hk${position.slice(2)}`], muted: true };
  }

  if (position === "smartset") {
    return { lines: ["Smart", "Set"], muted: true };
  }

  return { lines: label.length > 5 ? split(label) : [label], muted: false };
}

/**
 * @param {number} n
 * @param {number} count
 */
function baseSize(n, count) {
  if (count > 1) {
    return n <= 6 ? 10 : 9;
  }

  if (n <= 2) {
    return 14;
  }

  if (n <= 4) {
    return 12;
  }

  return n <= 6 ? 10.5 : 8;
}

/**
 * Font size in pixels for a cap one key unit = 50 px wide, shrunk until the longest line fits.
 * @param {string[]} lines
 * @param {number} w
 * @param {number} h
 */
export function fontFor(lines, w, h) {
  const n = Math.max(1, ...lines.map((l) => l.length));
  const wide = w > 1.1 || h > 1.1 ? 1 : 0;

  return Math.min(baseSize(n, lines.length) + wide, (w * 50 - 10) / (0.6 * n));
}
