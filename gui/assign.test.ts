import { describe, expect, test } from "bun:test";

import keyboard from "../data/keyboard.json";
import tokens from "../data/tokens.json";
import { copyArgs, isKnown, keyName, labels } from "./assign.mjs";

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

describe("keyName", () => {
  const map = labels(tokens);

  test.each([
    ["caps", "Caps Lock"],
    ["lctr", "Left Ctrl"],
    ["hk3", "Hotkey 3"],
    ["pedl", "Pedal"],
  ])("given %p, then the key is called %p", (position, name) => {
    expect(keyName(position, keyboard.defaults.base, map)).toBe(name);
  });
});

describe("copyArgs", () => {
  test("given a remapped source, then the target gets its action on the layer shown", () => {
    const source = {
      position: "rctr",
      kind: "remap",
      action: "caxx",
      macros: [],
    } as const;

    expect(copyArgs(source, "caps", "function1", 9)).toEqual([
      "session",
      "set-remap",
      "--profile",
      "9",
      "--layer",
      "function1",
      "--pos",
      "caps",
      "--action",
      "caxx",
    ]);
  });

  test("given a tap-and-hold source, then tap, hold and delay are copied", () => {
    const source = {
      position: "a",
      kind: "taphold",
      tap: "a",
      ms: 200,
      hold: "lctr",
      macros: [],
    } as const;

    expect(copyArgs(source, "s", "base", 1)).toEqual([
      "session",
      "set-taphold",
      "--profile",
      "1",
      "--layer",
      "base",
      "--pos",
      "s",
      "--tap",
      "a",
      "--ms",
      "200",
      "--hold",
      "lctr",
    ]);
  });

  test("given a macro trigger, then only its own action is copied", () => {
    const source = {
      position: "h",
      kind: "default",
      action: "h",
      macros: [{ cotrigger: "lctr", tokens: ["h", "i"] }],
    } as const;

    expect(copyArgs(source, "j", "base", 1)).toContain("h");
    expect(copyArgs(source, "j", "base", 1)).not.toContain("set-macro");
  });

  test("given a hotkey with no action, then there is nothing to copy", () => {
    expect(
      copyArgs(
        { position: "hk1", kind: "default", action: null, macros: [] },
        "caps",
        "base",
        1,
      ),
    ).toBeNull();
  });
});
