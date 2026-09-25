import { describe, expect, test } from "bun:test";

import { macroPreview, macroTokens, stripOf } from "./macro.mjs";

const hi = [
  { token: "lshf", stroke: "down" },
  { token: "h", stroke: "tap" },
  { token: "lshf", stroke: "up" },
  { token: "i", stroke: "tap" },
] as const;

describe("macroTokens", () => {
  test("given the Hi strip at speed 5, then the tokens match the audit's macro", () => {
    expect(macroTokens([...hi], 5, null)).toBe("{s5}{-lshf}{h}{+lshf}{i}");
  });

  test("given no speed and a repeat, then only the repeat heads the strokes", () => {
    expect(macroTokens([{ token: "a", stroke: "tap" }], null, 3)).toBe(
      "{x3}{a}",
    );
  });
});

describe("stripOf", () => {
  test("given the audit's macro, then speed and strokes come back", () => {
    expect(stripOf(["s5", "-lshf", "h", "+lshf", "i"])).toEqual({
      strip: [...hi],
      speed: 5,
      repeat: null,
    });
  });

  test("given a delay and a lone minus, then both stay plain steps", () => {
    expect(stripOf(["d200", "-", "x2"])).toEqual({
      strip: [
        { token: "d200", stroke: "tap" },
        { token: "-", stroke: "tap" },
      ],
      speed: null,
      repeat: 2,
    });
  });

  test("given tokens, when turned into a strip and back, then they are unchanged", () => {
    const tokens = ["s3", "x2", "-lctr", "c", "+lctr"];
    const { strip, speed, repeat } = stripOf(tokens);

    expect(macroTokens(strip, speed, repeat)).toBe(
      tokens.map((t) => `{${t}}`).join(""),
    );
  });
});

describe("macroPreview", () => {
  test("given Shift held around h, then the strip types Hi", () => {
    expect(macroPreview([...hi])).toBe("Hi");
  });

  test("given shifted digits and a key that types nothing, then the preview shows both", () => {
    expect(
      macroPreview([
        { token: "rshf", stroke: "down" },
        { token: "1", stroke: "tap" },
        { token: "rshf", stroke: "up" },
        { token: "esc", stroke: "tap" },
      ]),
    ).toBe("!‹esc›");
  });
});
