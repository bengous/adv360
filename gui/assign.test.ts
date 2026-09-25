import { describe, expect, test } from "bun:test";

import tokens from "../data/tokens.json";
import { isKnown, labels } from "./assign.mjs";

describe("labels", () => {
  test("given tokens.json, then each token maps to its SmartSet label", () => {
    const map = labels(tokens);

    expect([map["esc"], map["lctr"], map["caxx"]]).toEqual([
      "Esc",
      "Left Ctrl",
      "Ctrl+Alt",
    ]);
  });
});

describe("isKnown", () => {
  test.each([
    ["esc", true],
    ["ESC", true],
    ["kp.", true],
    ["notatoken", false],
  ])("given %p, then known is %p", (token, known) => {
    expect(isKnown(token, tokens)).toBe(known);
  });
});
