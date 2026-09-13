import { describe, expect, test } from "bun:test";

import { effectiveLayer } from "./layout-view.ts";
import { parseLayout } from "./layout.ts";

describe("effective layer", () => {
  const layout = parseLayout(
    `${[
      "[q]>[w]",
      "<base>",
      "[caps]>[esc]",
      "*[caps]>[tab]",
      "[CAPS]>[ent]",
      "{lctr}{hk3}>{a}",
      "{hk3}>{b}",
      "<keypad>",
      "[caps]>[f1]",
    ].join("\r\n")}\r\n`,
  );

  test("the last non-disabled line of the layer wins, keyed case-insensitively", () => {
    const base = effectiveLayer(layout, "base");
    expect(base.keys.get("caps")).toEqual({
      line: 5,
      entry: { kind: "remap", position: "CAPS", action: "ent" },
    });
    expect(base.keys.has("q")).toBe(false);
    expect(effectiveLayer(layout, "keypad").keys.get("caps")?.entry).toEqual({
      kind: "remap",
      position: "caps",
      action: "f1",
    });
  });

  test("macros are keyed by trigger and co-trigger", () => {
    const base = effectiveLayer(layout, "base");
    expect([...base.macros.keys()].toSorted()).toEqual(["hk3+", "hk3+lctr"]);
    expect(base.macros.get("hk3+lctr")?.line).toBe(6);
  });
});
