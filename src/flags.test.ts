import { describe, expect, test } from "bun:test";

import { UsageError } from "./errors.ts";
import { need, parseFlags } from "./flags.ts";
import { editFromFlags } from "./session-flags.ts";
import { parseMacroTokens, parseTapHoldMs } from "./txt/layout.ts";
import { parseRgb } from "./txt/led.ts";

describe("session edits from flags", () => {
  test("given remap flags, when building the edit, then the layer alias is resolved", () => {
    expect(
      editFromFlags("set-remap", { layer: "kp", pos: "a", action: "b" }),
    ).toEqual({
      kind: "layout",
      edit: { op: "set-remap", layer: "keypad", position: "a", action: "b" },
    });
  });

  test("given tap-hold flags, when building the edit, then the delay is a TapHoldMs", () => {
    expect(
      editFromFlags("set-taphold", {
        layer: "base",
        pos: "a",
        tap: "a",
        ms: "50",
        hold: "b",
      }),
    ).toEqual({
      kind: "layout",
      edit: {
        op: "set-taphold",
        layer: "base",
        position: "a",
        tap: "a",
        ms: parseTapHoldMs("50"),
        hold: "b",
      },
    });
  });

  test("given macro flags without a co-trigger, when building the edit, then cotrigger is null", () => {
    expect(
      editFromFlags("set-macro", {
        layer: "fn1",
        trigger: "hk1",
        tokens: "{a}{b}",
      }),
    ).toEqual({
      kind: "layout",
      edit: {
        op: "set-macro",
        layer: "function1",
        trigger: "hk1",
        cotrigger: null,
        tokens: parseMacroTokens("{a}{b}"),
      },
    });
  });

  test("given --pos, when removing, then it is a key removal; given --trigger, a macro removal", () => {
    expect(editFromFlags("remove", { layer: "base", pos: "a" }).edit).toEqual({
      op: "remove",
      layer: "base",
      position: "a",
    });
    expect(
      editFromFlags("remove", {
        layer: "base",
        trigger: "hk1",
        cotrigger: "lctr",
      }).edit,
    ).toEqual({
      op: "remove-macro",
      layer: "base",
      trigger: "hk1",
      cotrigger: "lctr",
    });
  });

  test("given layer colours, when building a led edit, then each lay* token keeps its colour", () => {
    expect(
      editFromFlags("set-led", {
        indicator: "ind3",
        func: "Layer",
        rgb: ["layd=1,2,3", "lay1=4,5,6"],
      }),
    ).toEqual({
      kind: "led",
      edit: {
        op: "set-led",
        indicator: "IND3",
        function: "layer",
        colors: { layd: parseRgb("1,2,3"), lay1: parseRgb("4,5,6") },
      },
    });
  });

  test.each([
    ["set-remap", { layer: "base", pos: "a" }, "--action is required"],
    ["set-led", { indicator: "ind1", func: "caps" }, "--rgb is required"],
    ["frob", {}, "unknown session verb: frob"],
  ])(
    "given %s with %j, when building the edit, then it is a usage error",
    (op, flags, message) => {
      expect(() => editFromFlags(op, flags)).toThrow(UsageError);
      expect(() => editFromFlags(op, flags)).toThrow(message);
    },
  );
});

describe("flag parsing", () => {
  test("given a verb with flags, when parsing, then positionals and values split", () => {
    expect(
      parseFlags([
        "view",
        "--profile",
        "1",
        "--rgb",
        "a",
        "--rgb",
        "b",
        "--dry-run",
      ]),
    ).toEqual({
      flags: { profile: "1", rgb: ["a", "b"], "dry-run": true },
      positionals: ["view"],
    });
  });

  test("given an unknown option, when parsing, then parseArgs throws a TypeError", () => {
    expect(() => parseFlags(["--bogus"])).toThrow(TypeError);
  });

  test("given an empty flag, when it is needed, then it is a usage error", () => {
    expect(() => need({ pos: "" }, "pos")).toThrow("--pos is required");
  });
});
