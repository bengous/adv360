import { describe, expect, test } from "bun:test";

import { changes, editArgs } from "./edits.mjs";

describe("editArgs", () => {
  test.each([
    [
      { op: "set-remap", layer: "base", position: "caps", action: "esc" },
      "session set-remap --profile 1 --layer base --pos caps --action esc",
    ],
    [
      {
        op: "set-taphold",
        layer: "base",
        position: "a",
        tap: "a",
        ms: 200,
        hold: "lctr",
      },
      "session set-taphold --profile 1 --layer base --pos a --tap a --ms 200 --hold lctr",
    ],
    [
      {
        op: "set-macro",
        layer: "base",
        trigger: "h",
        cotrigger: "lctr",
        tokens: ["s5", "-lshf", "h", "+lshf", "i"],
      },
      "session set-macro --profile 1 --layer base --trigger h --cotrigger lctr --tokens {s5}{-lshf}{h}{+lshf}{i}",
    ],
    [
      { op: "remove-macro", layer: "function1", trigger: "h", cotrigger: null },
      "session remove --profile 1 --layer function1 --trigger h",
    ],
    [
      {
        op: "set-led",
        indicator: "IND3",
        function: "layer",
        colors: { layd: [0, 0, 0], lay1: [0, 255, 255] },
      },
      "session set-led --profile 1 --indicator IND3 --func layer --rgb layd=0,0,0 --rgb lay1=0,255,255",
    ],
    [
      {
        op: "set-led",
        indicator: "IND1",
        function: "caps",
        colors: { caps: [255, 255, 255] },
      },
      "session set-led --profile 1 --indicator IND1 --func caps --rgb 255,255,255",
    ],
  ] as const)("given %p, then the replay is %p", (edit, line) => {
    expect(editArgs(edit, 1)?.join(" ")).toBe(line);
  });

  test("given a restored file, then it cannot be replayed from flags", () => {
    expect(editArgs({ op: "replace-file", text: "<base>\r\n" }, 1)).toBeNull();
  });
});

const macro = (cotrigger: string | null, tokens: string[]) =>
  ({
    op: "set-macro",
    layer: "base",
    trigger: "h",
    cotrigger,
    tokens,
  }) as const;

describe("changes", () => {
  test("given four writes of one macro, then one change shows the last", () => {
    const edits = [
      macro(null, ["a"]),
      macro(null, ["a", "b"]),
      macro(null, ["a", "b", "c"]),
    ];

    expect(changes(edits)).toEqual([{ indices: [0, 1, 2], show: edits[2]! }]);
  });

  test("given a co-trigger moved from none to Ctrl, then the change shows the Ctrl macro", () => {
    const moved = macro("lctr", ["h", "i"]);

    const edits = [
      macro(null, ["h", "i"]),
      {
        op: "remove-macro",
        layer: "base",
        trigger: "h",
        cotrigger: null,
      } as const,
      moved,
    ];

    expect(changes(edits)).toEqual([{ indices: [0, 1, 2], show: moved }]);
  });

  test("given edits on two keys and one LED, then each gets its own change in first-edit order", () => {
    const edits = [
      { op: "set-remap", layer: "base", position: "caps", action: "esc" },
      {
        op: "set-led",
        indicator: "IND3",
        function: "caps",
        colors: { caps: [1, 2, 3] },
      },
      { op: "set-remap", layer: "function1", position: "caps", action: "f1" },
      { op: "remove", layer: "base", position: "caps" },
    ] as const;

    expect(changes(edits).map((c) => c.indices)).toEqual([[0, 3], [1], [2]]);
    expect(changes(edits)[0]!.show).toEqual(edits[3]);
  });
});
