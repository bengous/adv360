import { describe, expect, test } from "bun:test";

import keyboard from "../data/keyboard.json";
import { beforeOf } from "./review.mjs";

const disk = {
  layout: [
    { kind: "header", layer: "base", disabled: false },
    {
      kind: "remap",
      layer: "base",
      position: "rctr",
      action: "caxx",
      disabled: false,
    },
    {
      kind: "remap",
      layer: "base",
      position: "rctr",
      action: "caxs",
      disabled: true,
    },
    {
      kind: "taphold",
      layer: "base",
      position: "a",
      tap: "a",
      ms: 200,
      hold: "lctr",
      disabled: false,
    },
    {
      kind: "macro",
      layer: "base",
      trigger: "hk3",
      cotrigger: "lctr",
      tokens: ["s5", "F6"],
      disabled: false,
    },
  ],
  led: [
    {
      kind: "led",
      indicator: "IND3",
      func: "layd",
      rgb: [0, 0, 0],
      disabled: false,
    },
    {
      kind: "led",
      indicator: "IND3",
      func: "lay1",
      rgb: [0, 0, 255],
      disabled: false,
    },
    {
      kind: "led",
      indicator: "IND1",
      func: "caps",
      rgb: [255, 255, 255],
      disabled: false,
    },
  ],
};

describe("beforeOf", () => {
  test("given a remapped key, then the last enabled line is what it did", () => {
    const edit = {
      op: "set-remap",
      layer: "base",
      position: "rctr",
      action: "esc",
    } as const;

    expect(beforeOf(edit, disk, keyboard.defaults)).toEqual({
      kind: "action",
      action: "caxx",
    });
  });

  test("given a key with no line, then it did its factory action", () => {
    const edit = {
      op: "set-remap",
      layer: "base",
      position: "caps",
      action: "esc",
    } as const;

    expect(beforeOf(edit, disk, keyboard.defaults)).toEqual({
      kind: "action",
      action: "caps",
    });
  });

  test("given a tap-and-hold key being reset, then tap, delay and hold come back", () => {
    const edit = { op: "remove", layer: "base", position: "a" } as const;

    expect(beforeOf(edit, disk, keyboard.defaults)).toEqual({
      kind: "taphold",
      tap: "a",
      ms: 200,
      hold: "lctr",
    });
  });

  test("given a macro on the same trigger and co-trigger, then its tokens come back", () => {
    const edit = {
      op: "set-macro",
      layer: "base",
      trigger: "hk3",
      cotrigger: "lctr",
      tokens: ["x"],
    } as const;

    expect(beforeOf(edit, disk, keyboard.defaults)).toEqual({
      kind: "macro",
      tokens: ["s5", "F6"],
    });
  });

  test("given a new macro, then there was none", () => {
    const edit = {
      op: "set-macro",
      layer: "base",
      trigger: "hk3",
      cotrigger: null,
      tokens: ["x"],
    } as const;

    expect(beforeOf(edit, disk, keyboard.defaults)).toEqual({
      kind: "macro",
      tokens: null,
    });
  });

  test("given a layer LED, then its function reads as layer with one colour per layer", () => {
    const edit = {
      op: "set-led",
      indicator: "IND3",
      function: "caps",
      colors: {},
    } as const;

    expect(beforeOf(edit, disk, keyboard.defaults)).toEqual({
      kind: "led",
      function: "layer",
      colors: { layd: [0, 0, 0], lay1: [0, 0, 255] },
    });
  });
});
