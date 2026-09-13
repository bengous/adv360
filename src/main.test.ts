import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { inspect } from "./inspect.ts";
import { view } from "./view.ts";

const REAL = join(import.meta.dir, "../tests/fixtures/real");

describe("inspect on the keyboard mirror", () => {
  test("reports 9 profiles, the active one, the firmware and the named backup", async () => {
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

  test("layout1 has 4 base remaps and 3 per other layer; layout2 carries the lctr+hk3 macro", async () => {
    const [p1, p2] = (await inspect(REAL)).profiles;
    const remaps = p1!.layout!.entries.filter((e) => e["kind"] === "remap");
    expect(remaps.length).toBe(16);
    expect(remaps.filter((e) => e["layer"] === "base").length).toBe(4);
    expect(p1!.led!.entries.length).toBe(14);
    const macro = p2!.layout!.entries.find((e) => e["kind"] === "macro");
    expect(macro).toEqual({
      line: 6,
      layer: "base",
      kind: "macro",
      trigger: "hk3",
      cotrigger: "lctr",
      tokens: ["s5", "x1", "lshf", "F6"],
      disabled: false,
    });
  });

  test("--profile narrows to one profile; an empty layout reports headers only", async () => {
    const report = await inspect(REAL, 9);
    expect(report.profiles.length).toBe(1);
    expect(report.profiles[0]!.layout!.entries.map((e) => e["kind"])).toEqual([
      "header",
      "header",
      "header",
      "header",
      "header",
    ]);
  });
});

describe("view on the keyboard mirror", () => {
  test("profile 1 base: rctr → caxx, rshf → prnt, q default, hk3 empty", async () => {
    const keys = new Map(
      (await view(REAL, 1, "base")).keys.map((k) => [k.position, k]),
    );

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

  test("profile 2 base: hk3 carries the lctr macro and stays default", async () => {
    const report = await view(REAL, 2, "base");
    const hk3 = report.keys.find((k) => k.position === "hk3")!;
    expect(hk3.kind).toBe("default");
    expect(hk3.macros).toEqual([
      { cotrigger: "lctr", tokens: ["s5", "x1", "lshf", "F6"], line: 6 },
    ]);
    expect(report.leds!.IND3.function).toBe("layer");
  });

  test("layer defaults fall back to base; keypad and fn layers carry their own", async () => {
    const kp = new Map(
      (await view(REAL, 9, "keypad")).keys.map((k) => [k.position, k]),
    );

    expect(kp.get("u")).toMatchObject({
      kind: "default",
      action: "kp7",
      label: "7",
    });
    expect(kp.get("a")).toMatchObject({ kind: "default", action: "a" });

    const fn1 = new Map(
      (await view(REAL, 9, "function1")).keys.map((k) => [k.position, k]),
    );

    expect(fn1.get("eql")).toMatchObject({ action: "f1", label: "F1" });
    expect(fn1.get("lfn")).toMatchObject({
      action: "defs",
      label: "Base Shift",
    });
  });
});

describe("adv360 exit codes", () => {
  const run = async (...args: string[]) => {
    const p = Bun.spawn(["bun", join(import.meta.dir, "main.ts"), ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
    ]);

    return { code: await p.exited, stdout, stderr };
  };

  test("0 with JSON, 1 with a named error, 2 on usage", async () => {
    const ok = await run(
      "view",
      "--source",
      REAL,
      "--profile",
      "1",
      "--layer",
      "fn1",
    );

    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).layer).toBe("function1");

    const notMounted = await run("inspect");
    expect(notMounted.code).toBe(1);
    expect(JSON.parse(notMounted.stdout)).toMatchObject({
      error: "not-mounted",
      next: "SmartSet + Hotkey 3",
    });

    const badProfile = await run(
      "view",
      "--source",
      REAL,
      "--profile",
      "12",
      "--layer",
      "base",
    );

    expect(badProfile.code).toBe(1);
    expect(JSON.parse(badProfile.stdout).error).toBe("bad-profile");

    const usage = await run("frob");
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain("usage:");
    expect(
      (await run("view", "--source", REAL, "--profile", "1", "--layer", "nope"))
        .code,
    ).toBe(2);
    expect((await run("inspect", "--bogus")).code).toBe(2);
  });
});
