import { describe, expect, test } from "bun:test";

import { profileHint } from "./hint.mjs";

const keyboard = {
  keys: [
    { position: "lalt", side: "left", cluster: "thumb" },
    { position: "rwin", side: "right", cluster: "thumb" },
  ],
};

type Leds = Record<
  string,
  { function: string; colors: Record<string, number[]> }
>;

const white = {
  IND2: { function: "prof", colors: { prof: [255, 255, 255] } },
} satisfies Leds;

function viewOf(lalt: string, rwin: string, leds: Leds | null = white) {
  return {
    keys: [
      { position: "lalt", action: lalt },
      { position: "rwin", action: rwin },
    ],
    leds,
  };
}

describe("profileHint", () => {
  test("given the profile LED set to white, when hinting, then the dot is white", () => {
    expect(profileHint(viewOf("lalt", "rwin"), keyboard)).toEqual({
      dot: "#ffffff",
      super: "Super: right thumb",
    });
  });

  test("given no indicator with the profile function, when hinting, then there is no dot", () => {
    const leds = {
      IND2: { function: "caps", colors: { caps: [255, 255, 255] } },
    };

    expect(profileHint(viewOf("lalt", "rwin", leds), keyboard).dot).toBe("");
  });

  test("given no LED file, when hinting, then there is no dot", () => {
    expect(profileHint(viewOf("lalt", "rwin", null), keyboard).dot).toBe("");
  });

  test("given the profile LED set to black, when hinting, then there is no dot", () => {
    const leds = { IND2: { function: "prof", colors: { prof: [0, 0, 0] } } };

    expect(profileHint(viewOf("lalt", "rwin", leds), keyboard).dot).toBe("");
  });

  test("given lalt remapped to lwin, when hinting, then Super is on the left thumb", () => {
    expect(profileHint(viewOf("lwin", "lalt"), keyboard).super).toBe(
      "Super: left thumb",
    );
  });

  test("given lwin on both thumbs, when hinting, then Super is on both thumbs", () => {
    expect(profileHint(viewOf("lwin", "lwin"), keyboard).super).toBe(
      "Super: left thumb, right thumb",
    );
  });

  test("given no key sending Super, when hinting, then the hint reads no Super", () => {
    expect(profileHint(viewOf("lalt", "lalt"), keyboard).super).toBe(
      "no Super",
    );
  });
});
