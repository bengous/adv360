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

describe("data/keyboard.json schematic", () => {
  const { schematic } = keyboard;
  const mirror = new Map(Object.entries(schematic.mirror));

  const drawn = [
    ...schematic.main.map((k) => k.position),
    ...schematic.thumb.keys.map((k) => k.position),
  ];

  test("draws the left half once and mirrors it onto every other position but the pedal", () => {
    const mirrored = drawn.map((p) => mirror.get(p) ?? `no mirror for ${p}`);

    const positions = keyboard.keys
      .map((k) => k.position)
      .filter((p) => p !== "pedl");

    expect(new Set([...drawn, ...mirrored]).size).toBe(76);
    expect([...drawn, ...mirrored].toSorted()).toEqual(positions.toSorted());
  });

  test("places the three left LEDs and mirrors them onto the right ones", () => {
    const left = schematic.leds.map((l) => l.indicator);
    const right = left.map((i) => mirror.get(i));

    expect([...left, ...right]).toEqual([
      "IND1",
      "IND2",
      "IND3",
      "IND6",
      "IND5",
      "IND4",
    ]);
  });

  test("puts every main key on a declared column", () => {
    const columns = schematic.columns.x.length;

    expect(schematic.columns.stagger).toHaveLength(columns);
    expect(schematic.main.filter((k) => k.col < 0 || k.col >= columns)).toEqual(
      [],
    );
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
