import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliError } from "../errors.ts";
import { rejection } from "../testkit.ts";
import { fakeDeps } from "./deps-fake.ts";
import { realDeps } from "./deps.ts";
import type { Deps } from "./deps.ts";

const ORIGINAL_PATH = process.env["PATH"] ?? "";

// The real adapter runs with a PATH holding only lsblk and udisksctl (when installed):
// no notifier, so notify takes its warn path instead of raising a desktop notification.
async function restrictedPath(): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "adv360-bin-"));

  for (const tool of ["lsblk", "udisksctl"]) {
    const found = Bun.which(tool);

    if (found !== null) {
      await symlink(found, join(bin, tool));
    }
  }

  return bin;
}

type Subject = { name: string; make: () => Promise<Deps> };

const held = () =>
  fakeDeps("/s", [{ path: "/dev/held", label: "ADV360", mountpoint: "/m" }]);

const subjects: Subject[] = [
  {
    name: "realDeps",
    async make() {
      process.env["PATH"] = await restrictedPath();

      return realDeps();
    },
  },
  {
    name: "fakeDeps",
    make: () => Promise.resolve(held()),
  },
];

describe.each(subjects)("Deps contract: $name", ({ make }) => {
  let deps: Deps;

  beforeAll(async () => {
    deps = await make();
  });

  afterAll(() => {
    process.env["PATH"] = ORIGINAL_PATH;
  });

  test("given two readings, when asking the time, then the clock never goes back", () => {
    const first = deps.now();

    expect(deps.now().getTime()).toBeGreaterThanOrEqual(first.getTime());
  });

  test("given a zero delay, when sleeping, then it resolves", async () => {
    await deps.sleep(0);
  });

  test("given the machine, when observing, then every device has a path and nullable label and mountpoint", async () => {
    const { devices } = await deps.observe();

    for (const device of devices) {
      expect(Object.keys(device).toSorted()).toEqual([
        "label",
        "mountpoint",
        "path",
      ]);
      expect(device.path).toBeString();
    }
  });

  test("given a device nobody holds, when unmounting it, then it rejects with a named error", async () => {
    const failure = await rejection(
      deps.unmount("/dev/adv360-contract-nowhere"),
    );

    expect(failure).toBeInstanceOf(CliError);
    expect(["eject-failed", "udisksctl-missing"]).toContain(
      failure instanceof CliError ? failure.error : "",
    );
  });

  test("given any notifier state, when notifying, then it never rejects", async () => {
    await deps.notify("adv360 contract", "never shown", "low");
  });

  test("given a line, when emitting or warning, then nothing throws", () => {
    deps.emit("");
    deps.warn("");
  });
});

describe("fake deps beyond the contract", () => {
  test("given the fake clock, when read twice, then it advances one second", () => {
    const deps = fakeDeps("/s");
    const first = deps.now();

    expect(deps.now().getTime() - first.getTime()).toBe(1000);
  });

  test("given a held device, when unmounting it, then it is recorded and no longer mounted", async () => {
    const deps = held();
    await deps.unmount("/dev/held");

    expect(deps.unmounted).toEqual(["/dev/held"]);
    expect((await deps.observe()).devices[0]?.mountpoint).toBeNull();
  });

  test("given failUnmount, when unmounting a held device, then it is eject-failed", async () => {
    const deps = held();
    deps.failUnmount = true;

    expect(await rejection(deps.unmount("/dev/held"))).toMatchObject({
      error: "eject-failed",
    });
  });
});
