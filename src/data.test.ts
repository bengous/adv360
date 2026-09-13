import { describe, expect, test } from "bun:test";

import keyboard from "../data/keyboard.json";
import tokens from "../data/tokens.json";

const actionLabels = new Map<string, string>();

for (const category of tokens.categories) {
  for (const [token, label] of Object.entries(category.tokens)) {
    expect(actionLabels.has(token), `duplicate token ${token}`).toBe(false);
    actionLabels.set(token, label);
  }
}

describe("data/keyboard.json", () => {
  test("carries the 77 hit-boxes of the SmartSet form inside the canvas", () => {
    expect(keyboard.keys).toHaveLength(77);
    expect(new Set(keyboard.keys.map((k) => k.position)).size).toBe(77);

    for (const k of keyboard.keys) {
      expect(k.x).toBeGreaterThanOrEqual(0);
      expect(k.y).toBeGreaterThanOrEqual(0);
      expect(k.x + k.w).toBeLessThanOrEqual(keyboard.canvas.width);
      expect(k.y + k.h).toBeLessThanOrEqual(keyboard.canvas.height);
    }

    expect(keyboard.leds.map((l) => l.indicator)).toEqual([
      "IND1",
      "IND2",
      "IND3",
      "IND4",
      "IND5",
      "IND6",
    ]);
  });

  test("defaults name real positions and real action tokens", () => {
    const positions = new Set(keyboard.keys.map((k) => k.position));

    for (const layer of Object.values(keyboard.defaults)) {
      for (const [position, action] of Object.entries(layer)) {
        expect(positions.has(position), `unknown position ${position}`).toBe(
          true,
        );
        expect(actionLabels.has(action), `unknown action ${action}`).toBe(true);
      }
    }

    expect(keyboard.defaults.base.kp).toBe("keyt");
    expect(keyboard.defaults.keypad.obrk).toBe("kp.");
    expect(keyboard.defaults.function1.eql).toBe("f1");
  });
});

describe("data/tokens.json", () => {
  test("every category has a name and a non-empty token table", () => {
    for (const category of tokens.categories) {
      expect(category.name.length).toBeGreaterThan(0);
      expect(Object.keys(category.tokens).length).toBeGreaterThan(0);
    }

    expect(actionLabels.get("caxx")).toBe("Ctrl+Alt");
    expect(Object.keys(tokens.led)).toContain("lay3");
  });
});
