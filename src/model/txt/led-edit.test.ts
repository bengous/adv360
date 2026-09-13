import { describe, expect, test } from "bun:test";

import { applyLedEdit } from "./led-edit.ts";
import { parseLed, parseRgb, serializeLed } from "./led.ts";

describe("led edits", () => {
  const text =
    "[ind1]>[caps][255][255][255]\r\n[ind3]>[layd][0][0][0]\r\n[ind3]>[layk][1][1][1]\r\n[ind4]>[nmlk][9][9][9]\r\n";

  test("given an indicator with lines, when setting it, then its lines are replaced in place", () => {
    const one = applyLedEdit(parseLed(text), {
      op: "set-led",
      indicator: "IND3",
      function: "prof",
      colors: { prof: parseRgb("1,2,3") },
    });

    expect(serializeLed(one)).toBe(
      "[ind1]>[caps][255][255][255]\r\n[IND3]>[prof][1][2][3]\r\n[ind4]>[nmlk][9][9][9]\r\n",
    );
  });

  test("given a new indicator, when setting layer colours, then one line per layer is appended in lay* order", () => {
    const layer = applyLedEdit(parseLed(text), {
      op: "set-led",
      indicator: "IND6",
      function: "layer",
      colors: { lay1: parseRgb("4,5,6"), layd: parseRgb("0,0,0") },
    });

    expect(serializeLed(layer)).toEndWith(
      "[ind4]>[nmlk][9][9][9]\r\n[IND6]>[layd][0][0][0]\r\n[IND6]>[lay1][4][5][6]\r\n",
    );
  });
});
