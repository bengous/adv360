import { beforeEach, describe, expect, test } from "bun:test";

import { executePlan } from "./apply.ts";
import { readDisk } from "./disk.ts";
import { decideApply } from "./plan.ts";
import { loadContext, loadRecord, saveRecord } from "./state.ts";
import {
  adv,
  DEVICE,
  mountFixture,
  recordOf,
  rejection,
  remount,
  setRemap,
  textAt,
} from "./testkit.ts";
import type { Fixture } from "./testkit.ts";

const WRITTEN =
  "<base>\r\n[caps]>[esc]\r\n\r\n<keypad>\r\n\r\n<function1>\r\n\r\n<function2>\r\n\r\n<function3>\r\n";

let fx: Fixture;

beforeEach(async () => {
  fx = await mountFixture();
  await setRemap(fx.deps, {
    profile: 9,
    layer: "base",
    pos: "caps",
    action: "esc",
  });
});

describe("the write record across the cycle", () => {
  test("given an ejected record, when asking around, then status says ejected, the session is applied and edits are refused", async () => {
    await adv(fx.deps, "apply", "--profile", "9");
    const status = await adv(fx.deps, "vdrive", "status");
    const session = await adv(fx.deps, "session", "status", "--profile", "9");

    const edit = await setRemap(fx.deps, {
      profile: 9,
      layer: "base",
      pos: "a",
      action: "b",
    });

    expect(status.last).toMatchObject({
      state: "ejected",
      next: expect.stringContaining("SmartSet + Hotkey 4"),
    });
    expect(session.last["state"]).toBe("applied");
    expect(edit.last["error"]).toBe("write-pending");
  });

  test("given an ejected record, when applying again, then it is not-mounted, and write-pending once remounted", async () => {
    await adv(fx.deps, "apply", "--profile", "9");
    const unmounted = await adv(fx.deps, "apply", "--profile", "9");
    remount(fx);
    const pending = await adv(fx.deps, "apply", "--profile", "9");

    expect(unmounted.last["error"]).toBe("not-mounted");
    expect(pending.last["error"]).toBe("write-pending");
  });

  test("given a failing eject, when applying, then the record stays written and a re-run retries only the eject", async () => {
    fx.deps.failUnmount = true;
    const failed = await adv(fx.deps, "apply", "--profile", "9");
    const status = await adv(fx.deps, "vdrive", "status");
    fx.deps.failUnmount = false;
    const retried = await adv(fx.deps, "apply", "--profile", "9");

    expect(failed.last["error"]).toBe("eject-failed");
    expect(await textAt(fx.mount, "layouts/layout9.txt")).toBe(WRITTEN);
    expect(status.last["state"]).toBe("busy-writing");
    expect(retried.lines.map((l) => l["event"])).toEqual([
      "retry-eject",
      "applied",
    ]);
    expect(retried.last["outcome"]).toEqual({
      kind: "ejected",
      next: expect.stringContaining("SmartSet + Hotkey 4"),
    });
  });

  test("given a died record, when applying, then it does not block and status showed corrupt-suspected first", async () => {
    await saveRecord(
      fx.deps.stateDir,
      recordOf(1, { kind: "writing" }, fx.mount),
    );
    const status = await adv(fx.deps, "vdrive", "status");
    const record = await loadRecord(fx.deps.stateDir);
    const applied = await adv(fx.deps, "apply", "--profile", "9");

    expect(status.last["state"]).toBe("corrupt-suspected");
    expect(record?.phase).toMatchObject({ kind: "failed", step: "died" });
    expect(applied.last["event"]).toBe("applied");
  });

  test("given a record created between plan and write, when executing the plan, then it is write-in-progress", async () => {
    const ctx = await loadContext(
      fx.deps.stateDir,
      9,
      await readDisk(fx.mount, 9),
    );

    const decision = decideApply(ctx, { dir: fx.mount, device: DEVICE }, "");

    if (decision.kind !== "plan") {
      throw new Error("expected a plan");
    }

    await saveRecord(
      fx.deps.stateDir,
      recordOf(1, { kind: "written" }, fx.mount),
    );

    const failure = await rejection(
      executePlan(fx.deps, decision.plan, ctx.record),
    );

    expect(failure.message).toContain("another write cycle");
  });
});
