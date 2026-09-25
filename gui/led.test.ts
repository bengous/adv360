import { describe, expect, test } from "bun:test";

import { colorsFor, hexOf, ledArgs, rgbOf } from "./led.mjs";

const layered = {
  function: "layer",
  colors: {
    layd: [0, 0, 0],
    layk: [255, 255, 255],
    lay1: [0, 0, 255],
    lay2: [0, 255, 0],
    lay3: [255, 0, 0],
  },
};

describe("rgbOf and hexOf", () => {
  test("given #00ffff, then it is 0,255,255 and back", () => {
    expect(rgbOf("#00ffff")).toEqual([0, 255, 255]);
    expect(hexOf([0, 255, 255])).toBe("#00ffff");
  });

  test("given a word, then the error names it", () => {
    expect(() => rgbOf("cyan")).toThrow("not a #rrggbb colour: cyan");
  });
});

describe("ledArgs", () => {
  test("given a layer LED with Fn1 changed, then all five layers are sent", () => {
    const colors = { ...layered.colors, lay1: rgbOf("#00ffff") };

    expect(ledArgs(1, "IND3", "layer", colors).join(" ")).toBe(
      "session set-led --profile 1 --indicator IND3 --func layer --rgb layd=0,0,0 --rgb layk=255,255,255 --rgb lay1=0,255,255 --rgb lay2=0,255,0 --rgb lay3=255,0,0",
    );
  });

  test("given a Caps Lock LED, then one colour is sent", () => {
    expect(ledArgs(9, "IND1", "caps", { caps: [255, 0, 0] }).join(" ")).toBe(
      "session set-led --profile 9 --indicator IND1 --func caps --rgb 255,0,0",
    );
  });

  test("given a disabled LED, then it is sent off", () => {
    expect(ledArgs(1, "IND2", "null", {}).join(" ")).toBe(
      "session set-led --profile 1 --indicator IND2 --func null --rgb 0,0,0",
    );
  });
});

describe("colorsFor", () => {
  test("given a layer LED turned into Caps Lock, then it keeps the colour of the layer shown", () => {
    expect(colorsFor(layered, "caps", "lay1")).toEqual({ caps: [0, 0, 255] });
  });

  test("given a Caps Lock LED turned into a layer LED, then every layer starts from its colour", () => {
    const caps = { function: "caps", colors: { caps: [1, 2, 3] } };

    expect(colorsFor(caps, "layer", "layd")).toEqual({
      layd: [1, 2, 3],
      layk: [1, 2, 3],
      lay1: [1, 2, 3],
      lay2: [1, 2, 3],
      lay3: [1, 2, 3],
    });
  });
});
