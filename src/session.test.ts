import { describe, expect, test } from "bun:test";

import { addEdit, deriveState, render } from "./session.ts";
import type { Session } from "./session.ts";
import { applyLayoutEdit, LayerMissing } from "./txt/layout-edit.ts";
import {
  parseLayout,
  parseMacroTokens,
  parseTapHoldMs,
  serializeLayout,
} from "./txt/layout.ts";
import { applyLedEdit } from "./txt/led-edit.ts";
import { parseLed, parseRgb, serializeLed } from "./txt/led.ts";

const EMPTY =
  "<base>\r\n\r\n<keypad>\r\n\r\n<function1>\r\n\r\n<function2>\r\n\r\n<function3>\r\n";

const edited = (
  text: string,
  ...edits: Parameters<typeof applyLayoutEdit>[1][]
) => serializeLayout(edits.reduce(applyLayoutEdit, parseLayout(text)));

describe("layout edits", () => {
  test("a new remap lands after the layer's last non-blank line, with the file's EOL", () => {
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

  test("an existing position is rewritten on its last line, keeping that line's EOL; other bytes stay", () => {
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

  test("remove drops every matching line of the layer; macros match on trigger + co-trigger", () => {
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

  test("a missing layer header is an error, never repaired; replace-file ignores the base", () => {
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

describe("led edits", () => {
  const text =
    "[ind1]>[caps][255][255][255]\r\n[ind3]>[layd][0][0][0]\r\n[ind3]>[layk][1][1][1]\r\n[ind4]>[nmlk][9][9][9]\r\n";

  test("set-led replaces the indicator's lines in place, layer writes one line per colour", () => {
    const one = applyLedEdit(parseLed(text), {
      op: "set-led",
      indicator: "IND3",
      function: "prof",
      colors: { prof: parseRgb("1,2,3") },
    });

    expect(serializeLed(one)).toBe(
      "[ind1]>[caps][255][255][255]\r\n[IND3]>[prof][1][2][3]\r\n[ind4]>[nmlk][9][9][9]\r\n",
    );

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

describe("session model", () => {
  const disk = { layout: EMPTY, led: "" };
  test("the first edit captures the base; the state is derived from disk and record", () => {
    const session = addEdit(
      null,
      9,
      {
        kind: "layout",
        edit: {
          op: "set-remap",
          layer: "base",
          position: "caps",
          action: "esc",
        },
      },
      disk,
    );

    expect(session.layout?.baseText).toBe(EMPTY);
    expect(render(session, "layout")).toContain("[caps]>[esc]");
    expect(render(session, "led")).toBeNull();
    expect(deriveState(null, null, disk)).toBe("clean");
    expect(deriveState(session, null, disk)).toBe("dirty");
    expect(deriveState(session, null, null)).toBe("dirty");
    expect(deriveState(session, null, { layout: "<base>\r\n", led: "" })).toBe(
      "conflict",
    );

    const record = {
      profile: 9 as const,
      phase: { kind: "ejected" as const },
    } as Parameters<typeof deriveState>[1] & object;

    expect(deriveState(session, record, disk)).toBe("applied");
    expect(deriveState(session, { ...record, profile: 1 }, disk)).toBe("dirty");
  });

  test("a second edit needs no disk; the first one without a disk is a named error", () => {
    const first: Session = {
      profile: 9,
      layout: { baseText: EMPTY, edits: [] },
    };

    expect(
      addEdit(
        first,
        9,
        {
          kind: "layout",
          edit: { op: "remove", layer: "base", position: "caps" },
        },
        null,
      ).layout?.edits.length,
    ).toBe(1);
    expect(() =>
      addEdit(
        null,
        9,
        { kind: "led", edit: { op: "replace-file", text: "" } },
        null,
      ),
    ).toThrow("the first edit needs the on-disk led file");
    expect(() =>
      addEdit(
        null,
        9,
        {
          kind: "layout",
          edit: {
            op: "set-remap",
            layer: "function3",
            position: "a",
            action: "b",
          },
        },
        { layout: "<base>\r\n", led: null },
      ),
    ).toThrow("layer header <function3> is missing");
  });
});
