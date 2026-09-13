import { describe, expect, test } from "bun:test";

import { recordOf } from "../testkit.ts";
import { decideEdit } from "./edit.ts";
import type { WriteRecord } from "./record.ts";
import { deriveState, render } from "./session.ts";
import type { Session, SessionContext, SessionState } from "./session.ts";
import type { Disk } from "./source.ts";

const EMPTY =
  "<base>\r\n\r\n<keypad>\r\n\r\n<function1>\r\n\r\n<function2>\r\n\r\n<function3>\r\n";

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
