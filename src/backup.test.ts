import { beforeEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { backup, backupDir } from "./backup.ts";
import { adv, mountFixture, rejection } from "./testkit.ts";
import type { Fixture } from "./testkit.ts";

let fx: Fixture;

beforeEach(async () => {
  fx = await mountFixture();
});

describe("backup", () => {
  test("given the mounted drive, when backing up, then the three folders are listed, named backups included", async () => {
    const made = await adv(fx.deps, "backup");

    expect(made.last["files"]).toEqual(
      expect.arrayContaining([
        "layouts/layout1.txt.backup",
        "settings/settings.txt",
        "lighting/led9.txt",
      ]),
    );
  });

  test("given two backups in one run, when stamping them, then they land in different dirs", async () => {
    await adv(fx.deps, "backup");
    await adv(fx.deps, "backup");

    expect(await readdir(join(fx.deps.stateDir, "backups"))).toHaveLength(2);
  });

  test("given an empty source, when backing up, then it is backup-failed", async () => {
    const dir = backupDir(fx.deps.stateDir, fx.deps.now());

    expect((await rejection(backup(fx.root, dir))).message).toContain(
      "nothing to back up",
    );
  });

  test("given a clock, when naming the dir, then the stamp has no separators", () => {
    expect(backupDir("/s", new Date("2026-09-13T12:00:00Z"))).toBe(
      "/s/backups/20260913T120000Z",
    );
  });
});
