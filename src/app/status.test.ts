import { describe, expect, test } from "bun:test";

import { decodeObject } from "../io/decode.ts";
import { fakeDeps } from "../io/deps-fake.ts";
import { rejection } from "../testkit.ts";
import { eject, findSource, findSourceOrNull, watch } from "./status.ts";

const MOUNTED = { path: "/dev/x", label: "ADV360", mountpoint: "/m" };

describe("source lookup", () => {
  test("given ADV360_SOURCE, when finding the source, then it is a copy with no device", async () => {
    const deps = fakeDeps("/s");
    deps.sourceEnv = "/copy";

    expect(await findSource(deps, undefined)).toEqual({
      dir: "/copy",
      device: null,
    });
    expect(await findSource(deps, "/flag")).toEqual({
      dir: "/flag",
      device: null,
    });
  });

  test("given no drive, when finding the source, then it is not-mounted or null", async () => {
    const deps = fakeDeps("/s");
    const failure = await rejection(findSource(deps, undefined));

    expect(failure).toMatchObject({
      error: "not-mounted",
      fields: { next: "SmartSet + Hotkey 3" },
    });
    expect(await findSourceOrNull(deps, undefined)).toBeNull();
  });
});

describe("watch", () => {
  test("given the drive appears, when watching, then one line per change and one notification", async () => {
    const deps = fakeDeps("/s");
    deps.nextDevices = [[], [MOUNTED]];
    deps.stopAfterSleeps = 2;
    const failure = await rejection(watch(deps, 5));

    expect(failure.message).toContain("fake sleep limit");
    expect(deps.lines.map((l) => decodeObject(l, "line")["state"])).toEqual([
      "absent",
      "mounted",
    ]);
    expect(deps.notifications.map((n) => n.headline)).toEqual([
      "Advantage360 v-Drive connected",
    ]);
    expect(deps.sleeps).toEqual([5, 5]);
  });
});

describe("eject", () => {
  test("given a mounted device, when ejecting, then it is unmounted and the close chord is next", async () => {
    const deps = fakeDeps("/s", [{ ...MOUNTED }]);

    expect(await eject(deps)).toEqual({
      event: "ejected",
      device: "/dev/x",
      next: "SmartSet + Hotkey 3 to close the v-Drive",
    });
    expect(deps.unmounted).toEqual(["/dev/x"]);
  });

  test("given no drive, when ejecting, then it is not-mounted", async () => {
    expect(await rejection(eject(fakeDeps("/s")))).toMatchObject({
      error: "not-mounted",
    });
  });
});
