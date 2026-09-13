import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { UsageError } from "../../errors.ts";
import { effectiveLeds } from "./led-edit.ts";
import {
  parseIndicator,
  parseLed,
  parseLedEntry,
  parseRgb,
  serializeLed,
} from "./led.ts";

const REAL = join(import.meta.dir, "../../../tests/fixtures/real/lighting");

describe("led files", () => {
  test("every real led file serializes byte-identical and defines 6 indicators", async () => {
    const names = await readdir(REAL);
    expect(names.length).toBe(9);

    for (const name of names) {
      const text = await Bun.file(join(REAL, name)).text();
      const file = parseLed(text);
      expect(serializeLed(file)).toBe(text);

      const indicators = new Set(
        file.lines.flatMap((l) =>
          l.entry.kind === "led" ? [l.entry.indicator] : [],
        ),
      );

      expect(indicators.size).toBe(6);
    }
  });

  test("grammar: function + RGB, disabled, unparsed", () => {
    expect(parseLedEntry("[ind2]>[prof][255][0][7]")).toEqual({
      kind: "led",
      indicator: "IND2",
      func: "prof",
      rgb: parseRgb("255,0,7"),
    });
    expect(parseLedEntry("*[IND1]>[caps][1][2][3]")).toMatchObject({
      kind: "disabled",
      inner: { kind: "led" },
    });
    expect(parseLedEntry("[IND7]>[caps][1][2][3]")).toEqual({
      kind: "unparsed",
    });
  });

  test("effective: later line wins, layer lines group into one indicator", async () => {
    const text = await Bun.file(join(REAL, "led1.txt")).text();
    const leds = effectiveLeds(parseLed(text));
    expect(leds.IND1).toEqual({
      function: "caps",
      colors: { caps: parseRgb("255,255,255") },
      lines: [1],
    });
    expect(leds.IND3.function).toBe("layer");
    expect(Object.keys(leds.IND3.colors)).toEqual([
      "layd",
      "layk",
      "lay1",
      "lay2",
      "lay3",
    ]);

    const overridden = effectiveLeds(
      parseLed("[IND1]>[caps][1][1][1]\r\n[IND1]>[null][0][0][0]\r\n"),
    );

    expect(overridden.IND1).toEqual({
      function: "null",
      colors: { null: parseRgb("0,0,0") },
      lines: [2],
    });
    expect(effectiveLeds(parseLed("")).IND6).toEqual({
      function: "null",
      colors: {},
      lines: [],
    });
  });
});

describe("led value parsers", () => {
  test.each([
    ["ind1", "IND1"],
    ["IND6", "IND6"],
  ])("given %s, when parsing an indicator, then it is %s", (text, ind) => {
    expect<string>(parseIndicator(text)).toBe(ind);
  });

  test.each(["ind0", "ind7", "", "led1"])(
    "given %j, when parsing an indicator, then it is a usage error",
    (text) => {
      expect(() => parseIndicator(text)).toThrow(UsageError);
    },
  );

  test.each([
    ["0,0,0", [0, 0, 0]],
    ["255,128,1", [255, 128, 1]],
  ])("given %s, when parsing an rgb, then it is %j", (text, rgb) => {
    expect<readonly number[]>(parseRgb(text)).toEqual(rgb);
  });

  test.each(["256,0,0", "-1,0,0", "1,2", "1,2,3,4", "a,b,c", "1.5,0,0", ""])(
    "given %j, when parsing an rgb, then it is a usage error",
    (text) => {
      expect(() => parseRgb(text)).toThrow(UsageError);
    },
  );

  test("given a component above 255 in a file, when parsing the entry, then it is unparsed", () => {
    expect(parseLedEntry("[IND1]>[caps][300][0][0]")).toEqual({
      kind: "unparsed",
    });
  });
});
