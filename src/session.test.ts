import { describe, expect, test } from "bun:test";

import type { WriteRecord } from "./record.ts";
import { decideEdit, deriveState, render } from "./session.ts";
import type { Session, SessionContext, SessionState } from "./session.ts";
import type { Disk } from "./source.ts";
import { recordOf } from "./testkit.ts";
import { applyLayoutEdit, LayerMissing } from "./txt/layout-edit.ts";
import type { LayoutEdit } from "./txt/layout-edit.ts";
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

const disk: Disk = { layout: EMPTY, led: "" };

const ctx = (
  session: Session | null,
  record: WriteRecord | null,
  onDisk: Disk | null,
): SessionContext => ({
  profile: 9,
  session,
  record,
  disk: onDisk,
});

describe("session model", () => {
  const remap: Parameters<typeof decideEdit>[1] = {
    kind: "layout",
    edit: { op: "set-remap", layer: "base", position: "caps", action: "esc" },
  };

  test("given a disk, when making the first edit, then the session captures the base and renders", () => {
    const session = decideEdit(ctx(null, null, disk), remap);

    expect(session.layout?.baseText).toBe(EMPTY);
    expect(render(session, "layout")).toContain("[caps]>[esc]");
    expect(render(session, "led")).toBeNull();
  });

  const cases: {
    name: string;
    open: boolean;
    record: WriteRecord | null;
    onDisk: Disk | null;
    state: SessionState;
  }[] = [
    {
      name: "no session",
      open: false,
      record: null,
      onDisk: null,
      state: "clean",
    },
    {
      name: "a matching disk",
      open: true,
      record: null,
      onDisk: disk,
      state: "dirty",
    },
    { name: "no disk", open: true, record: null, onDisk: null, state: "dirty" },
    {
      name: "a changed disk",
      open: true,
      record: null,
      onDisk: { layout: "<base>\r\n", led: "" },
      state: "conflict",
    },
    {
      name: "an ejected record",
      open: true,
      record: recordOf(9, { kind: "ejected" }),
      onDisk: disk,
      state: "applied",
    },
    {
      name: "a record for another profile",
      open: true,
      record: recordOf(1, { kind: "ejected" }),
      onDisk: disk,
      state: "dirty",
    },
  ];

  test.each(cases)(
    "given $name, when deriving the state, then it is $state",
    ({ open, record, onDisk, state }) => {
      const live = open ? decideEdit(ctx(null, null, disk), remap) : null;

      expect(deriveState(ctx(live, record, onDisk))).toBe(state);
    },
  );

  test("given a captured base, when editing without a disk, then the edit is accepted", () => {
    const first: Session = {
      profile: 9,
      layout: { baseText: EMPTY, edits: [] },
    };

    const removal = {
      kind: "layout" as const,
      edit: { op: "remove" as const, layer: "base" as const, position: "caps" },
    };

    expect(
      decideEdit(ctx(first, null, null), removal).layout?.edits,
    ).toHaveLength(1);
  });

  test.each([
    [
      "no disk",
      null,
      { kind: "led", edit: { op: "replace-file", text: "" } },
      "the first edit needs the on-disk led file",
    ],
    [
      "a layout without the layer",
      { layout: "<base>\r\n", led: null },
      {
        kind: "layout",
        edit: {
          op: "set-remap",
          layer: "function3",
          position: "a",
          action: "b",
        },
      },
      "layer header <function3> is missing",
    ],
  ] as const)(
    "given %s, when making the first edit, then it fails with a named message",
    (_, onDisk, edit, message) => {
      expect(() => decideEdit(ctx(null, null, onDisk), edit)).toThrow(message);
    },
  );
});
