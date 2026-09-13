import { describe, expect, test } from "bun:test";
import { composeState, nextStep, observe, watchStep } from "./vdrive.ts";
import type { WriteRecord } from "./write.ts";

const record = (kind: WriteRecord["phase"]["kind"]): WriteRecord =>
  ({ profile: 9, phase: kind === "failed" ? { kind, step: "rename", error: "x" } : { kind } }) as WriteRecord;

describe("v-Drive observation", () => {
  test("label ADV360 decides absent / ejected / mounted", () => {
    expect(observe({ devices: [{ path: "/dev/sda1", label: null, mountpoint: "/" }] })).toEqual({ state: "absent" });
    expect(observe({ devices: [{ path: "/dev/sdb", label: "ADV360", mountpoint: null }] })).toEqual({ state: "ejected", device: "/dev/sdb" });
    expect(observe({ devices: [{ path: "/dev/sdb", label: "ADV360", mountpoint: "/run/media/u/ADV360" }] })).toEqual({
      state: "mounted", mount: "/run/media/u/ADV360", device: "/dev/sdb",
    });
  });

  test("the write record overrides the observed state", () => {
    const mounted = observe({ devices: [{ path: "/dev/sdb", label: "ADV360", mountpoint: "/m" }] });
    expect(composeState(mounted, null)).toBe("mounted");
    expect(composeState(mounted, record("writing"))).toBe("busy-writing");
    expect(composeState(mounted, record("written"))).toBe("busy-writing");
    expect(composeState(mounted, record("ejected"))).toBe("mounted");
    expect(composeState({ state: "absent" }, record("failed"))).toBe("corrupt-suspected");
  });

  test("next names the chord the human must press", () => {
    expect(nextStep("absent", null)).toContain("SmartSet + Hotkey 3");
    expect(nextStep("mounted", null)).toBeNull();
    expect(nextStep("mounted", record("ejected"))).toBe("run adv360 verify");
    expect(nextStep("ejected", record("ejected"))).toContain("SmartSet + Hotkey 4");
    expect(nextStep("corrupt-suspected", record("failed"))).toContain("restore");
  });

  test("watch notifies only on absent → mounted", () => {
    const mounted = { state: "mounted" as const, mount: "/m", device: "/dev/sdb" };
    expect(watchStep(null, { state: "absent" })).toEqual({ changed: true, notify: false });
    expect(watchStep({ state: "absent" }, mounted)).toEqual({ changed: true, notify: true });
    expect(watchStep({ state: "ejected", device: "/dev/sdb" }, mounted)).toEqual({ changed: true, notify: false });
    expect(watchStep(mounted, { ...mounted })).toEqual({ changed: false, notify: false });
  });
});
