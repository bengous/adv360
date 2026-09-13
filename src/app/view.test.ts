import { describe, expect, test } from "bun:test";

import { parseMacroTokens } from "../model/txt/layout.ts";
import { FIXTURES } from "../testkit.ts";
import { view } from "./view.ts";

const keysOf = async (
  profile: 1 | 2 | 9,
  layer: "base" | "keypad" | "function1",
) =>
  new Map(
    (await view(FIXTURES, profile, layer)).keys.map((k) => [k.position, k]),
  );

describe("view on the keyboard mirror", () => {
  test("given profile 1 base, when viewing, then remaps, defaults and an empty hotkey show", async () => {
    const keys = await keysOf(1, "base");

    expect(keys.get("rctr")).toMatchObject({
      kind: "remap",
      action: "caxx",
      label: "Ctrl+Alt",
      line: 5,
    });
    expect(keys.get("rshf")).toMatchObject({
      kind: "remap",
      action: "prnt",
      label: "Print Scrn",
    });
    expect(keys.get("q")).toMatchObject({
      kind: "default",
      action: "q",
      label: "Q",
    });
    expect(keys.get("hk3")).toEqual({
      position: "hk3",
      kind: "default",
      action: null,
      label: "",
      macros: [],
      pending: false,
    });
    expect(keys.size).toBe(77);
  });

  test("given profile 2 base, when viewing, then hk3 carries the lctr macro and stays default", async () => {
    const report = await view(FIXTURES, 2, "base");
    const hk3 = report.keys.find((k) => k.position === "hk3");

    expect(hk3).toMatchObject({
      kind: "default",
      macros: [
        {
          cotrigger: "lctr",
          tokens: parseMacroTokens("{s5}{x1}{lshf}{F6}"),
          line: 6,
        },
      ],
    });
    expect(report.leds!.IND3.function).toBe("layer");
  });

  test("given the keypad and fn1 layers, when viewing, then their defaults fall back to base", async () => {
    const kp = await keysOf(9, "keypad");
    const fn1 = await keysOf(9, "function1");

    expect(kp.get("u")).toMatchObject({
      kind: "default",
      action: "kp7",
      label: "7",
    });
    expect(kp.get("a")).toMatchObject({ kind: "default", action: "a" });
    expect(fn1.get("eql")).toMatchObject({ action: "f1", label: "F1" });
    expect(fn1.get("lfn")).toMatchObject({
      action: "defs",
      label: "Base Shift",
    });
  });
});
