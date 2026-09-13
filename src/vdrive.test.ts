import { describe, expect, test } from "bun:test";

import type { WriteRecord } from "./record.ts";
import { recordOf } from "./testkit.ts";
import {
  composeState,
  ejectTarget,
  mountedAt,
  nextStep,
  observe,
  sourceOf,
  sourceOrNull,
  statusOf,
  watchStep,
} from "./vdrive.ts";
import type { ComposedState, VDrive } from "./vdrive.ts";

const record = (kind: WriteRecord["phase"]["kind"]): WriteRecord =>
  recordOf(
    9,
    kind === "failed" ? { kind, step: "rename", error: "x" } : { kind },
  );

const MOUNTED: VDrive = { state: "mounted", mount: "/m", device: "/dev/sdb" };

describe("v-Drive observation", () => {
  test.each<
    [
      string,
      { path: string; label: string | null; mountpoint: string | null }[],
      VDrive,
    ]
  >([
    [
      "no ADV360 label",
      [{ path: "/dev/sda1", label: null, mountpoint: "/" }],
      { state: "absent" },
    ],
    [
      "an unmounted ADV360",
      [{ path: "/dev/sdb", label: "ADV360", mountpoint: null }],
      { state: "ejected", device: "/dev/sdb" },
    ],
    [
      "a mounted ADV360",
      [{ path: "/dev/sdb", label: "ADV360", mountpoint: "/m" }],
      MOUNTED,
    ],
  ])(
    "given %s, when observing, then the drive is %j",
    (_, devices, expected) => {
      expect(observe({ devices })).toEqual(expected);
    },
  );

  test.each<[WriteRecord | null, ComposedState]>([
    [null, "mounted"],
    [record("writing"), "busy-writing"],
    [record("written"), "busy-writing"],
    [record("ejected"), "mounted"],
    [record("failed"), "corrupt-suspected"],
  ])(
    "given record %j on a mounted drive, when composing, then the state is %s",
    (rec, state) => {
      expect(composeState(MOUNTED, rec)).toBe(state);
    },
  );

  test("given each state, when asking for the next step, then it names the chord or command", () => {
    expect(nextStep("absent", null)).toContain("SmartSet + Hotkey 3");
    expect(nextStep("mounted", null)).toBeNull();
    expect(nextStep("mounted", record("ejected"))).toBe("run adv360 verify");
    expect(nextStep("ejected", record("ejected"))).toContain(
      "SmartSet + Hotkey 4",
    );
    expect(nextStep("corrupt-suspected", record("failed"))).toContain(
      "restore",
    );
  });

  test("given consecutive observations, when stepping the watch, then it notifies only on absent → mounted", () => {
    expect(watchStep(null, { state: "absent" })).toEqual({
      changed: true,
      notify: false,
    });
    expect(watchStep({ state: "absent" }, MOUNTED)).toEqual({
      changed: true,
      notify: true,
    });
    expect(
      watchStep({ state: "ejected", device: "/dev/sdb" }, MOUNTED),
    ).toEqual({ changed: true, notify: false });
    expect(watchStep(MOUNTED, { ...MOUNTED })).toEqual({
      changed: false,
      notify: false,
    });
  });
});

describe("v-Drive status and eject target", () => {
  test("given a mounted drive and settings, when composing the status, then the active profile and next step show", () => {
    const status = statusOf(
      MOUNTED,
      record("ejected"),
      "profile=3\nkbd_fw_l=1\nkbd_fw_r=2\n",
      "/s",
    );

    expect(status).toMatchObject({
      state: "mounted",
      observed: MOUNTED,
      active_profile: 3,
      firmware: { left: "1", right: "2" },
      next: "run adv360 verify",
      stateDir: "/s",
    });
  });

  test("given a mounted device, when picking the eject target, then it is the device", () => {
    expect(ejectTarget(statusOf(MOUNTED, null, null, "/s"))).toBe("/dev/sdb");
  });

  test.each<[string, VDrive, WriteRecord | null, string]>([
    ["a copy under --source", mountedAt("/copy"), null, "not-mounted"],
    ["an absent drive", { state: "absent" }, null, "not-mounted"],
    ["a writing record", MOUNTED, record("writing"), "write-in-progress"],
  ])(
    "given %s, when picking the eject target, then it is %s",
    (_, observed, rec, error) => {
      const status = statusOf(observed, rec, null, "/s");

      expect(() => ejectTarget(status)).toThrow(
        expect.objectContaining({ error }),
      );
    },
  );

  test("given an observation, when taking its source, then only a mounted drive yields one", () => {
    expect(sourceOf(MOUNTED)).toEqual({ dir: "/m", device: "/dev/sdb" });
    expect(sourceOrNull({ state: "ejected", device: "/dev/sdb" })).toBeNull();
    expect(() => sourceOf({ state: "absent" })).toThrow(
      expect.objectContaining({ error: "not-mounted" }),
    );
  });
});
