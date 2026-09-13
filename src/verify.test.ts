import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { loadRecord } from "./state.ts";
import {
  adv,
  mountFixture,
  recordOf,
  remount,
  setRemap,
  textAt,
} from "./testkit.ts";
import type { Fixture } from "./testkit.ts";
import { decideVerify, pendingRecord } from "./verify.ts";
import type { VerifyResult } from "./verify.ts";

const record = () => ({
  ...recordOf(9, { kind: "ejected" }),
  files: [
    { rel: "layouts/layout9.txt", before: "old", after: "new" },
    { rel: "lighting/led9.txt", before: null, after: "led" },
  ],
});

describe("verify decision", () => {
  test.each<[(string | null)[], VerifyResult]>([
    [["new", "led"], "verified"],
    [["old", null], "unchanged"],
    [["new", null], "mismatch"],
    [["zzz", "led"], "mismatch"],
    [[null, null], "mismatch"],
  ])(
    "given on-disk hashes %j, when deciding, then the result is %s",
    (hashes, result) => {
      expect(decideVerify(record(), hashes).result).toBe(result);
    },
  );

  test("given a record, when deciding, then every file reports expected and actual", () => {
    expect(decideVerify(record(), ["new"]).files).toEqual([
      { rel: "layouts/layout9.txt", expected: "new", actual: "new" },
      { rel: "lighting/led9.txt", expected: "led", actual: null },
    ]);
  });

  test.each([null, recordOf(9, { kind: "writing" })])(
    "given record %j, when looking for a pending write, then it is no-write-record",
    (value) => {
      expect(() => pendingRecord(value)).toThrow("nothing to verify");
    },
  );
});

describe("verify after an apply", () => {
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
    await adv(fx.deps, "apply", "--profile", "9");
    remount(fx);
  });

  test("given the written file on the reopened drive, when verifying, then record and session are cleared", async () => {
    const verified = await adv(fx.deps, "verify");
    const session = await adv(fx.deps, "session", "status", "--profile", "9");
    const again = await adv(fx.deps, "verify");

    expect(verified.last).toMatchObject({ result: "verified", profile: 9 });
    expect(await loadRecord(fx.deps.stateDir)).toBeNull();
    expect(session.last["state"]).toBe("clean");
    expect(again.last["error"]).toBe("no-write-record");
  });

  test("given the original file back on the drive, when verifying, then the record clears and the session stays dirty", async () => {
    await Bun.write(join(fx.mount, "layouts/layout9.txt"), before);
    const verified = await adv(fx.deps, "verify");
    const session = await adv(fx.deps, "session", "status", "--profile", "9");

    expect(verified.last["result"]).toBe("unchanged");
    expect(await loadRecord(fx.deps.stateDir)).toBeNull();
    expect(session.last["state"]).toBe("dirty");
  });

  test("given garbage on the drive, when verifying, then the drive is corrupt-suspected with a failed verify record", async () => {
    await Bun.write(join(fx.mount, "layouts/layout9.txt"), "garbage");
    const verified = await adv(fx.deps, "verify");
    const status = await adv(fx.deps, "vdrive", "status");

    expect(verified.last["result"]).toBe("mismatch");
    expect(status.last["state"]).toBe("corrupt-suspected");
    expect((await loadRecord(fx.deps.stateDir))?.phase).toMatchObject({
      kind: "failed",
      step: "verify",
    });
  });
});
