import { describe, expect, test } from "bun:test";

import { inspect } from "./inspect.ts";
import { FIXTURES } from "./testkit.ts";
import { parseMacroTokens } from "./txt/layout.ts";

describe("inspect on the keyboard mirror", () => {
  test("given the mirror, when inspecting, then 9 profiles, the active one, the firmware and the named backup show", async () => {
    const report = await inspect(FIXTURES);

    expect(report.profiles.map((p) => p.profile)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(report.active_profile).toBe(1);
    expect(report.firmware).toEqual({ left: "1.0.69", right: "1.0.69" });
    expect(report.backups).toEqual(["layouts/layout1.txt.backup"]);
    expect(report.profiles.flatMap((p) => p.layout?.warnings ?? [])).toEqual(
      [],
    );
  });

  test("given profile 1 and 2, when inspecting, then the remap counts and the lctr+hk3 macro match the files", async () => {
    const [p1, p2] = (await inspect(FIXTURES)).profiles;
    const remaps = p1!.layout!.entries.filter((e) => e.kind === "remap");

    expect(remaps).toHaveLength(16);
    expect(remaps.filter((e) => e.layer === "base")).toHaveLength(4);
    expect(p1!.led!.entries).toHaveLength(14);
    expect(p2!.layout!.entries.find((e) => e.kind === "macro")).toEqual({
      line: 6,
      layer: "base",
      kind: "macro",
      trigger: "hk3",
      cotrigger: "lctr",
      tokens: parseMacroTokens("{s5}{x1}{lshf}{F6}"),
      disabled: false,
    });
  });

  test("given --profile 9, when inspecting, then one empty profile reports headers only", async () => {
    const report = await inspect(FIXTURES, 9);

    expect(report.profiles).toHaveLength(1);
    expect(report.profiles[0]!.layout!.entries.map((e) => e.kind)).toEqual([
      "header",
      "header",
      "header",
      "header",
      "header",
    ]);
  });
});
