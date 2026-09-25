import { describe, expect, test } from "bun:test";

import { backupLabel, cycleStep } from "./cycle.mjs";

// backupLabel prints local time; the examples of the plan are in Paris time.
process.env.TZ = "Europe/Paris";

const status = (state: string, observed: string, phase: string | null) => ({
  state,
  observed: { state: observed },
  pending_write:
    phase === null
      ? null
      : { backup_dir: "/s/backups/b1", phase: { kind: phase } },
});

const session = { layout: { edits: [1, 2] }, led: { edits: [3] } };

describe("cycleStep", () => {
  test.each([
    ["no status yet", null, { kind: "open", chord: "SmartSet + Hotkey 3" }],
    [
      "an absent drive",
      status("absent", "absent", null),
      { kind: "open", chord: "SmartSet + Hotkey 3" },
    ],
    [
      "an ejected drive with no write",
      status("ejected", "ejected", null),
      { kind: "open", chord: "SmartSet + Hotkey 3" },
    ],
    [
      "a mounted drive",
      status("mounted", "mounted", null),
      { kind: "edit", pending: 3 },
    ],
    [
      "a write in flight",
      status("busy-writing", "mounted", "written"),
      { kind: "write" },
    ],
    [
      "an ejected write, drive ejected",
      status("ejected", "ejected", "ejected"),
      {
        kind: "reload",
        chord: "SmartSet + Hotkey 4",
        next: "SmartSet + Hotkey 3",
      },
    ],
    [
      "an ejected write, drive gone",
      status("absent", "absent", "ejected"),
      {
        kind: "reload",
        chord: "SmartSet + Hotkey 4",
        next: "SmartSet + Hotkey 3",
      },
    ],
    [
      "an ejected write, drive back",
      status("mounted", "mounted", "ejected"),
      { kind: "verify" },
    ],
    [
      "a failed write",
      status("corrupt-suspected", "mounted", "failed"),
      { kind: "broken", backup: "/s/backups/b1" },
    ],
  ] as const)("given %s, then the step is %p", (_, s, step) => {
    expect(cycleStep(s, session)).toEqual(step);
  });
});

describe("backupLabel", () => {
  const now = new Date("2026-09-25T13:47:00Z");

  test.each([
    ["20260925T134700Z", "today 15:47"],
    ["20260913T192107Z", "13 Sep 21:21"],
    ["20251231T230000Z", "1 Jan 00:00"],
    ["20241231T100000Z", "31 Dec 2024 11:00"],
    ["layout1.txt.backup", "layout1.txt.backup"],
  ])("given %p, then the label is %p", (dir, label) => {
    expect(backupLabel(dir, now)).toBe(label);
  });
});
