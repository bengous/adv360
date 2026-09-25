import { describe, expect, test } from "bun:test";

import { fontFor, legend } from "./legend.mjs";

describe("legend", () => {
  test.each([
    ["Esc", "caps", ["Esc"]],
    ["Kp Toggle", "kp", ["Kp", "Toggle"]],
    ["Ctrl+Alt+Win+Shift", "rctr", ["Ctrl+Alt+", "Win+Shift"]],
    ["Mouse Scroll Up", "a", ["Mouse", "Scroll Up"]],
    ["notatoken", "q", ["notatoken"]],
    ["", "hk3", ["Hk3"]],
    ["", "smartset", ["Smart", "Set"]],
  ])("given %p on %p, then the lines are %p", (label, position, lines) => {
    expect(legend(label, position).lines).toEqual(lines);
  });

  test("given a hotkey with no action, then its legend is muted", () => {
    expect(legend("", "hk1")).toEqual({ lines: ["Hk1"], muted: true });
  });

  test("given a remapped hotkey, then its action shows at full contrast", () => {
    expect(legend("F5", "hk1")).toEqual({ lines: ["F5"], muted: false });
  });
});

describe("fontFor", () => {
  test("given a long single word, then the size shrinks until it fits the cap", () => {
    const size = fontFor(["notatoken"], 1, 1);

    expect(size * 0.6 * "notatoken".length).toBeLessThanOrEqual(50 - 10);
  });

  test("given a short legend on a tall key, then the wide bonus applies", () => {
    expect(fontFor(["A"], 1, 2)).toBe(15);
  });

  test("given two lines, then both get the two-line size", () => {
    expect(fontFor(["Left", "Shift"], 1.25, 1)).toBe(11);
  });
});
