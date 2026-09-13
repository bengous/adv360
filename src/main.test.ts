import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { decodeObject } from "./decode.ts";
import { fakeDeps } from "./deps-fake.ts";
import { inspect } from "./inspect.ts";
import { run } from "./main.ts";
import { parseMacroTokens } from "./txt/layout.ts";
import { view } from "./view.ts";

const REAL = join(import.meta.dir, "../tests/fixtures/real");

describe("inspect on the keyboard mirror", () => {
  test("given the mirror, when inspecting, then 9 profiles, the active one, the firmware and the named backup show", async () => {
    const report = await inspect(REAL);

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
    const [p1, p2] = (await inspect(REAL)).profiles;
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
    const report = await inspect(REAL, 9);

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

const keysOf = async (
  profile: 1 | 2 | 9,
  layer: "base" | "keypad" | "function1",
) =>
  new Map((await view(REAL, profile, layer)).keys.map((k) => [k.position, k]));

describe("view on the keyboard mirror", () => {
  test("given profile 1 base, when viewing, then remaps, defaults and an empty hotkey show", async () => {
    const keys = await keysOf(1, "base");

    expect(keys.get("rctr")).toMatchObject({
      kind: "remap",
      action: "caxx",
      label: "Ctrl+Alt",
      line: 5,
    });
    expect(keys.get("rshf")).toMatchObject({
      kind: "remap",
      action: "prnt",
      label: "Print Scrn",
    });
    expect(keys.get("q")).toMatchObject({
      kind: "default",
      action: "q",
      label: "Q",
    });
    expect(keys.get("hk3")).toEqual({
      position: "hk3",
      kind: "default",
      action: null,
      label: "",
      macros: [],
      pending: false,
    });
    expect(keys.size).toBe(77);
  });

  test("given profile 2 base, when viewing, then hk3 carries the lctr macro and stays default", async () => {
    const report = await view(REAL, 2, "base");
    const hk3 = report.keys.find((k) => k.position === "hk3");

    expect(hk3).toMatchObject({
      kind: "default",
      macros: [
        {
          cotrigger: "lctr",
          tokens: parseMacroTokens("{s5}{x1}{lshf}{F6}"),
          line: 6,
        },
      ],
    });
    expect(report.leds!.IND3.function).toBe("layer");
  });

  test("given the keypad and fn1 layers, when viewing, then their defaults fall back to base", async () => {
    const kp = await keysOf(9, "keypad");
    const fn1 = await keysOf(9, "function1");

    expect(kp.get("u")).toMatchObject({
      kind: "default",
      action: "kp7",
      label: "7",
    });
    expect(kp.get("a")).toMatchObject({ kind: "default", action: "a" });
    expect(fn1.get("eql")).toMatchObject({ action: "f1", label: "F1" });
    expect(fn1.get("lfn")).toMatchObject({
      action: "defs",
      label: "Base Shift",
    });
  });
});

const call = async (...argv: string[]) => {
  const deps = fakeDeps("/nowhere");
  const code = await run(argv, deps);

  return { code, out: deps.lines, err: deps.warnings };
};

describe("adv360 exit codes", () => {
  test("given a valid verb, when running, then exit 0 with one JSON line", async () => {
    const ok = await call(
      "view",
      "--source",
      REAL,
      "--profile",
      "1",
      "--layer",
      "fn1",
    );

    expect(ok.code).toBe(0);
    expect(decodeObject(ok.out[0] ?? "", "line")).toMatchObject({
      layer: "function1",
    });
  });

  test.each([
    [["inspect"], "not-mounted"],
    [
      ["view", "--source", REAL, "--profile", "12", "--layer", "base"],
      "bad-profile",
    ],
  ])(
    "given %j, when running, then exit 1 with error %s on stdout",
    async (argv, error) => {
      const reply = await call(...argv);

      expect(reply.code).toBe(1);
      expect(decodeObject(reply.out[0] ?? "", "line")).toMatchObject({ error });
    },
  );

  test.each([
    ["frob"],
    ["view", "--source", REAL, "--profile", "1", "--layer", "nope"],
    ["inspect", "--bogus"],
    [],
  ])(
    "given %j, when running, then exit 2 with the usage on stderr",
    async (...argv) => {
      const reply = await call(...argv);

      expect(reply.code).toBe(2);
      expect(reply.out).toEqual([]);
      expect(reply.err[0]).toContain("usage:");
    },
  );

  test("given the binary entry point, when a verb is unknown, then the process exits 2", async () => {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "main.ts"), "frob"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(await proc.exited).toBe(2);
  });
});
