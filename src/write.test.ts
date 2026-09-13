import { beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fakeDeps } from "./deps.ts";
import type { FakeDeps } from "./deps.ts";
import { run } from "./main.ts";
import { loadRecord, recordPath, saveRecord, sha256 } from "./write.ts";

const FIXTURES = join(import.meta.dir, "../tests/fixtures/real");

let root: string;

let mount: string;

let deps: FakeDeps;

let out: string[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "adv360-"));
  mount = join(root, "ADV360");
  await cp(FIXTURES, mount, { recursive: true });
  deps = fakeDeps(join(root, "state"), [
    { path: "/dev/fake", label: "ADV360", mountpoint: mount },
  ]);
  out = [];
  console.log = (line: string) => void out.push(line);
});

const adv = async (
  ...argv: string[]
): Promise<{ code: number; last: Record<string, unknown> }> => {
  const code = await run(argv, deps);

  return { code, last: JSON.parse(out.at(-1)!) };
};

const text = (rel: string) => Bun.file(join(mount, rel)).text();

describe("apply cycle on a fake v-Drive", () => {
  test("backup, atomic write, read-back, eject, notify; then verify clears record and session", async () => {
    const before = await text("layouts/layout9.txt");
    expect(
      (
        await adv(
          "session",
          "set-remap",
          "--profile",
          "9",
          "--layer",
          "base",
          "--pos",
          "caps",
          "--action",
          "esc",
        )
      ).last["state"],
    ).toBe("dirty");
    expect((await adv("diff", "--profile", "9")).last["files"]).toEqual([
      {
        rel: "layouts/layout9.txt",
        diff: expect.stringContaining("+[caps]>[esc]\r\n"),
      },
    ]);

    const dry = await adv("apply", "--profile", "9", "--dry-run");
    expect(dry.last).toEqual({ event: "dry-run", profile: 9 });
    expect(JSON.parse(out.at(-2)!)).toMatchObject({
      event: "plan",
      eject: "/dev/fake",
      files: [{ rel: "layouts/layout9.txt", creates: false }],
    });
    expect(await text("layouts/layout9.txt")).toBe(before);

    const applied = await adv("apply", "--profile", "9");
    expect(applied.code).toBe(0);
    expect(applied.last).toMatchObject({
      event: "applied",
      ejected: true,
      verified: false,
      files: ["layouts/layout9.txt"],
    });
    expect(await text("layouts/layout9.txt")).toBe(
      "<base>\r\n[caps]>[esc]\r\n\r\n<keypad>\r\n\r\n<function1>\r\n\r\n<function2>\r\n\r\n<function3>\r\n",
    );
    expect(await readdir(join(mount, "layouts"))).not.toContainEqual(
      expect.stringContaining("adv360-tmp"),
    );
    expect(
      await Bun.file(
        join(applied.last["backup_dir"] as string, "layouts/layout9.txt"),
      ).text(),
    ).toBe(before);
    expect(
      await Bun.file(
        join(applied.last["backup_dir"] as string, "settings/settings.txt"),
      ).exists(),
    ).toBe(true);
    expect(deps.unmounted).toEqual(["/dev/fake"]);
    expect(deps.notifications[0]?.headline).toBe("Profile 9 written");
    expect((await loadRecord(deps.stateDir))?.phase).toEqual({
      kind: "ejected",
    });
    expect((await adv("vdrive", "status")).last).toMatchObject({
      state: "ejected",
      next: expect.stringContaining("SmartSet + Hotkey 4"),
    });
    expect(
      (await adv("session", "status", "--profile", "9")).last["state"],
    ).toBe("applied");
    expect(
      (
        await adv(
          "session",
          "set-remap",
          "--profile",
          "9",
          "--layer",
          "base",
          "--pos",
          "a",
          "--action",
          "b",
        )
      ).last["error"],
    ).toBe("write-pending");
    expect((await adv("apply", "--profile", "9")).last["error"]).toBe(
      "not-mounted",
    );

    deps.devices[0]!.mountpoint = mount;
    expect((await adv("apply", "--profile", "9")).last["error"]).toBe(
      "write-pending",
    );
    expect((await adv("verify")).last).toMatchObject({
      result: "verified",
      profile: 9,
    });
    expect(await loadRecord(deps.stateDir)).toBeNull();
    expect(
      (await adv("session", "status", "--profile", "9")).last["state"],
    ).toBe("clean");
    expect((await adv("verify")).last["error"]).toBe("no-write-record");
  });

  test("verify: unchanged clears the record and keeps the session; mismatch flags corrupt-suspected", async () => {
    const before = await text("layouts/layout9.txt");
    await adv(
      "session",
      "set-remap",
      "--profile",
      "9",
      "--layer",
      "base",
      "--pos",
      "caps",
      "--action",
      "esc",
    );
    await adv("apply", "--profile", "9");
    deps.devices[0]!.mountpoint = mount;

    await Bun.write(join(mount, "layouts/layout9.txt"), before);
    expect((await adv("verify")).last["result"]).toBe("unchanged");
    expect(await loadRecord(deps.stateDir)).toBeNull();
    expect(
      (await adv("session", "status", "--profile", "9")).last["state"],
    ).toBe("dirty");

    await adv("apply", "--profile", "9");
    deps.devices[0]!.mountpoint = mount;
    await Bun.write(join(mount, "layouts/layout9.txt"), "garbage");
    expect((await adv("verify")).last["result"]).toBe("mismatch");
    expect((await adv("vdrive", "status")).last["state"]).toBe(
      "corrupt-suspected",
    );
    expect((await loadRecord(deps.stateDir))?.phase).toMatchObject({
      kind: "failed",
      step: "verify",
    });
  });

  test("a failed eject keeps the record written; a re-run retries the eject", async () => {
    await adv(
      "session",
      "set-led",
      "--profile",
      "9",
      "--indicator",
      "ind1",
      "--func",
      "prof",
      "--rgb",
      "1,2,3",
    );
    deps.failUnmount = true;
    const failed = await adv("apply", "--profile", "9");
    expect(failed.last["error"]).toBe("eject-failed");
    expect((await loadRecord(deps.stateDir))?.phase).toEqual({
      kind: "written",
    });
    expect(await text("lighting/led9.txt")).toContain(
      "[IND1]>[prof][1][2][3]\r\n",
    );
    expect((await adv("vdrive", "status")).last["state"]).toBe("busy-writing");
    deps.failUnmount = false;
    const retried = await adv("apply", "--profile", "9");
    expect(retried.last).toMatchObject({ event: "applied", ejected: true });
    expect(JSON.parse(out.at(-2)!)["event"]).toBe("retry-eject");
  });

  test("under --source there is no eject: the write is verified by read-back and the session closes", async () => {
    const dir = join(root, "copy");
    await cp(FIXTURES, dir, { recursive: true });
    await adv(
      "session",
      "set-remap",
      "--profile",
      "9",
      "--layer",
      "fn1",
      "--pos",
      "hk1",
      "--action",
      "f13",
      "--source",
      dir,
    );
    const applied = await adv("apply", "--profile", "9", "--source", dir);
    expect(applied.last).toMatchObject({
      event: "applied",
      ejected: false,
      verified: true,
    });
    expect(deps.unmounted).toEqual([]);
    expect(await loadRecord(deps.stateDir)).toBeNull();
    expect(
      (await adv("view", "--profile", "9", "--layer", "fn1", "--source", dir))
        .last["keys"],
    ).toContainEqual(
      expect.objectContaining({
        position: "hk1",
        kind: "remap",
        action: "f13",
        label: "F13",
        pending: false,
      }),
    );
  });

  test("rejections by name: not-mounted, no-session, no-change, session-conflict, write-in-progress, layer-missing", async () => {
    deps.devices = [];
    expect((await adv("apply", "--profile", "9")).last).toMatchObject({
      error: "not-mounted",
      next: "SmartSet + Hotkey 3",
    });
    expect(
      (
        await adv(
          "session",
          "set-remap",
          "--profile",
          "9",
          "--layer",
          "base",
          "--pos",
          "caps",
          "--action",
          "esc",
        )
      ).last["error"],
    ).toBe("no-base");
    deps.devices = [{ path: "/dev/fake", label: "ADV360", mountpoint: mount }];
    expect((await adv("apply", "--profile", "9")).last["error"]).toBe(
      "no-session",
    );

    await adv(
      "session",
      "set-remap",
      "--profile",
      "9",
      "--layer",
      "base",
      "--pos",
      "caps",
      "--action",
      "esc",
    );
    await adv(
      "session",
      "remove",
      "--profile",
      "9",
      "--layer",
      "base",
      "--pos",
      "caps",
    );
    expect((await adv("apply", "--profile", "9")).last["error"]).toBe(
      "no-change",
    );

    await Bun.write(
      join(mount, "layouts/layout9.txt"),
      "<base>\r\n[q]>[w]\r\n",
    );
    expect(
      (await adv("session", "status", "--profile", "9")).last["state"],
    ).toBe("conflict");
    expect((await adv("apply", "--profile", "9")).last["error"]).toBe(
      "session-conflict",
    );
    expect(
      (
        await adv(
          "session",
          "set-remap",
          "--profile",
          "9",
          "--layer",
          "base",
          "--pos",
          "a",
          "--action",
          "b",
        )
      ).last["error"],
    ).toBe("session-conflict");
    expect(
      (await adv("session", "discard", "--profile", "9")).last["state"],
    ).toBe("clean");
    expect(
      (
        await adv(
          "session",
          "set-remap",
          "--profile",
          "9",
          "--layer",
          "fn3",
          "--pos",
          "a",
          "--action",
          "b",
        )
      ).last["error"],
    ).toBe("layer-missing");

    await adv(
      "session",
      "set-remap",
      "--profile",
      "9",
      "--layer",
      "base",
      "--pos",
      "a",
      "--action",
      "b",
    );
    await saveRecord(deps.stateDir, {
      profile: 1,
      started_at: "",
      backup_dir: "",
      source: { dir: mount, device: null },
      files: [],
      phase: { kind: "writing" },
    });
    expect((await adv("vdrive", "status")).last["state"]).toBe(
      "corrupt-suspected",
    );
    expect((await loadRecord(deps.stateDir))?.phase).toMatchObject({
      kind: "failed",
      step: "died",
    });
    expect((await adv("apply", "--profile", "9")).last["event"]).toBe(
      "applied",
    );
  });

  test("a record created between plan and write is write-in-progress", async () => {
    await adv(
      "session",
      "set-remap",
      "--profile",
      "9",
      "--layer",
      "base",
      "--pos",
      "a",
      "--action",
      "b",
    );
    const { planApply, executeApply } = await import("./write.ts");
    const plan = await planApply(deps, { dir: mount, device: "/dev/fake" }, 9);
    await Bun.write(
      recordPath(deps.stateDir),
      JSON.stringify({ profile: 1, phase: { kind: "written" } }),
    );
    await expect(executeApply(deps, plan)).rejects.toThrow(
      "another write cycle",
    );
  });

  test("backup lists its files; restore opens a replace-file session from a dir or a file", async () => {
    const made = await adv("backup");
    expect(made.last["files"]).toEqual(
      expect.arrayContaining([
        "layouts/layout1.txt.backup",
        "settings/settings.txt",
        "lighting/led9.txt",
      ]),
    );
    await Bun.write(
      join(mount, "layouts/layout9.txt"),
      "<base>\r\n[q]>[w]\r\n",
    );

    const restored = await adv(
      "restore",
      made.last["backup_dir"] as string,
      "--profile",
      "9",
    );

    expect(restored.last).toMatchObject({
      state: "dirty",
      layout: { edits: [{ op: "replace-file" }] },
      led: { edits: [{ op: "replace-file" }] },
    });
    expect((await adv("diff", "--profile", "9")).last["files"]).toEqual([
      { rel: "layouts/layout9.txt", diff: expect.stringContaining("-[q]>[w]") },
      { rel: "lighting/led9.txt", diff: "" },
    ]);
    await adv("session", "discard", "--profile", "9");

    const fromFile = await adv(
      "restore",
      join(FIXTURES, "layouts/layout1.txt.backup"),
      "--profile",
      "9",
    );

    expect(fromFile.last).toMatchObject({
      layout: {
        edits: [
          {
            op: "replace-file",
            text: expect.stringContaining("[rctr]>[caxx]"),
          },
        ],
      },
      led: null,
    });
    expect(
      (await adv("restore", join(root, "nowhere"), "--profile", "9")).last[
        "error"
      ],
    ).toBe("restore-source-missing");
    expect(sha256("a")).toHaveLength(64);
  });
});
