import { beforeEach, describe, expect, test } from "bun:test";
import { cp, readdir } from "node:fs/promises";
import { join } from "node:path";

import { loadRecord } from "./state.ts";
import {
  adv,
  DEVICE,
  FIXTURES,
  mountFixture,
  setLed,
  setRemap,
  str,
  textAt,
} from "./testkit.ts";
import type { Fixture } from "./testkit.ts";

const WRITTEN =
  "<base>\r\n[caps]>[esc]\r\n\r\n<keypad>\r\n\r\n<function1>\r\n\r\n<function2>\r\n\r\n<function3>\r\n";

let fx: Fixture;

let before: string;

beforeEach(async () => {
  fx = await mountFixture();
  before = await textAt(fx.mount, "layouts/layout9.txt");
  await setRemap(fx.deps, {
    profile: 9,
    layer: "base",
    pos: "caps",
    action: "esc",
  });
});

describe("apply --dry-run", () => {
  test("given a dirty session, when applying dry, then the plan names the eject and nothing is written", async () => {
    const reply = await adv(fx.deps, "apply", "--profile", "9", "--dry-run");

    expect(reply.lines[0]).toMatchObject({
      event: "plan",
      eject: DEVICE,
      files: [{ rel: "layouts/layout9.txt", creates: false }],
    });
    expect(reply.last).toEqual({ event: "dry-run", profile: 9 });
    expect(await textAt(fx.mount, "layouts/layout9.txt")).toBe(before);
  });
});

describe("apply on the mounted v-Drive", () => {
  test("given a dirty session, when applying, then the file is rewritten atomically and the report says ejected", async () => {
    const applied = await adv(fx.deps, "apply", "--profile", "9");

    expect(applied.code).toBe(0);
    expect(applied.last).toMatchObject({
      event: "applied",
      files: ["layouts/layout9.txt"],
      outcome: { kind: "ejected" },
    });
    expect(await textAt(fx.mount, "layouts/layout9.txt")).toBe(WRITTEN);
    expect(await readdir(join(fx.mount, "layouts"))).not.toContainEqual(
      expect.stringContaining("adv360-tmp"),
    );
  });

  test("given an apply, when it succeeds, then the backup holds the original and settings.txt", async () => {
    const applied = await adv(fx.deps, "apply", "--profile", "9");
    const dir = str(applied.last, "backup_dir");

    expect(await textAt(dir, "layouts/layout9.txt")).toBe(before);
    expect(await Bun.file(join(dir, "settings/settings.txt")).exists()).toBe(
      true,
    );
  });

  test("given an apply, when it succeeds, then the device is unmounted, the human notified and the record ejected", async () => {
    await adv(fx.deps, "apply", "--profile", "9");

    expect(fx.deps.unmounted).toEqual([DEVICE]);
    expect(fx.deps.notifications[0]?.headline).toBe("Profile 9 written");
    expect((await loadRecord(fx.deps.stateDir))?.phase).toEqual({
      kind: "ejected",
    });
  });
});

describe("apply on a led session", () => {
  test("given a led edit, when applying, then the led file carries the new line", async () => {
    await adv(fx.deps, "session", "discard", "--profile", "9");
    await setLed(fx.deps, {
      profile: 9,
      indicator: "ind1",
      func: "prof",
      rgb: ["1,2,3"],
    });
    const applied = await adv(fx.deps, "apply", "--profile", "9");

    expect(applied.last["files"]).toEqual(["lighting/led9.txt"]);
    expect(await textAt(fx.mount, "lighting/led9.txt")).toContain(
      "[IND1]>[prof][1][2][3]\r\n",
    );
  });
});

describe("apply under --source", () => {
  test("given a copy, when applying, then read-back verifies, nothing is ejected and the session closes", async () => {
    const dir = join(fx.root, "copy");
    await cp(FIXTURES, dir, { recursive: true });
    await setRemap(fx.deps, {
      profile: 9,
      layer: "fn1",
      pos: "hk1",
      action: "f13",
      source: dir,
    });

    const applied = await adv(
      fx.deps,
      "apply",
      "--profile",
      "9",
      "--source",
      dir,
    );

    const view = await adv(
      fx.deps,
      "view",
      "--profile",
      "9",
      "--layer",
      "fn1",
      "--source",
      dir,
    );

    expect(applied.last["outcome"]).toEqual({ kind: "verified-by-readback" });
    expect(fx.deps.unmounted).toEqual([]);
    expect(await loadRecord(fx.deps.stateDir)).toBeNull();
    expect(view.last["keys"]).toContainEqual(
      expect.objectContaining({
        position: "hk1",
        kind: "remap",
        action: "f13",
        label: "F13",
        pending: false,
      }),
    );
  });
});
