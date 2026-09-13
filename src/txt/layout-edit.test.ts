import { describe, expect, test } from "bun:test";

import { applyLayoutEdit, LayerMissing } from "./layout-edit.ts";
import type { LayoutEdit } from "./layout-edit.ts";
import {
  parseLayout,
  parseMacroTokens,
  parseTapHoldMs,
  serializeLayout,
} from "./layout.ts";

const EMPTY =
  "<base>\r\n\r\n<keypad>\r\n\r\n<function1>\r\n\r\n<function2>\r\n\r\n<function3>\r\n";

const edited = (text: string, ...edits: LayoutEdit[]) =>
  serializeLayout(edits.reduce(applyLayoutEdit, parseLayout(text)));

describe("layout edits", () => {
  test("given an empty layer, when adding a remap, then it lands after the header with the file's EOL", () => {
    expect(
      edited(EMPTY, {
        op: "set-remap",
        layer: "base",
        position: "caps",
        action: "esc",
      }),
    ).toBe(
      "<base>\r\n[caps]>[esc]\r\n\r\n<keypad>\r\n\r\n<function1>\r\n\r\n<function2>\r\n\r\n<function3>\r\n",
    );
    expect(
      edited(EMPTY, {
        op: "set-remap",
        layer: "function3",
        position: "a",
        action: "b",
      }),
    ).toEndWith("<function3>\r\n[a]>[b]\r\n");
    expect(
      edited("<base>", {
        op: "set-remap",
        layer: "base",
        position: "a",
        action: "b",
      }),
    ).toBe("<base>\r\n[a]>[b]\r\n");
  });

  test("given a position set twice, when remapping it, then the last line is rewritten with its own EOL", () => {
    const text =
      "<base>\r\n[caps]>[esc]\n[q]>[w]\r\n[CAPS]>[tab]\n<keypad>\r\n[caps]>[x]\r\n";

    expect(
      edited(text, {
        op: "set-remap",
        layer: "base",
        position: "caps",
        action: "ent",
      }),
    ).toBe(
      "<base>\r\n[caps]>[esc]\n[q]>[w]\r\n[caps]>[ent]\n<keypad>\r\n[caps]>[x]\r\n",
    );
    expect(
      edited(text, {
        op: "set-taphold",
        layer: "keypad",
        position: "caps",
        tap: "caps",
        ms: parseTapHoldMs("50"),
        hold: "esc",
      }),
    ).toEndWith("<keypad>\r\n[caps]>[caps][t&h050][esc]\r\n");
  });

  test("given matching lines, when removing, then every one in the layer goes; macros match on trigger and co-trigger", () => {
    const text =
      "<base>\r\n[caps]>[esc]\r\n{lctr}{hk3}>{a}\r\n{hk3}>{b}\r\n[caps]>[tab]\r\n<keypad>\r\n[caps]>[x]\r\n";

    expect(
      edited(text, { op: "remove", layer: "base", position: "CAPS" }),
    ).toBe(
      "<base>\r\n{lctr}{hk3}>{a}\r\n{hk3}>{b}\r\n<keypad>\r\n[caps]>[x]\r\n",
    );
    expect(
      edited(text, {
        op: "remove-macro",
        layer: "base",
        trigger: "hk3",
        cotrigger: "lctr",
      }),
    ).not.toContain("{lctr}{hk3}");
    expect(
      edited(text, {
        op: "set-macro",
        layer: "base",
        trigger: "hk3",
        cotrigger: "lctr",
        tokens: parseMacroTokens("{s9}{-lshf}{h}{+lshf}"),
      }),
    ).toContain("{lctr}{hk3}>{s9}{-lshf}{h}{+lshf}\r\n{hk3}>{b}");
  });

  test("given a missing layer header, when editing, then it is layer-missing; replace-file ignores the base", () => {
    expect(() =>
      edited("<base>\r\n", {
        op: "set-remap",
        layer: "keypad",
        position: "a",
        action: "b",
      }),
    ).toThrow(LayerMissing);
    expect(
      edited("<base>\r\n", { op: "replace-file", text: "<keypad>\n" }),
    ).toBe("<keypad>\n");
  });
});
