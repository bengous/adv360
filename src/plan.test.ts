import { describe, expect, test } from "bun:test";

import { decideApply, describePlan, recordFor } from "./plan.ts";
import type { ApplyContext } from "./plan.ts";
import type { WritePhase } from "./record.ts";
import type { Session } from "./session.ts";
import { recordOf } from "./testkit.ts";

const EMPTY = "<base>\r\n\r\n<keypad>\r\n";

const dirty: Session = {
  profile: 9,
  layout: {
    baseText: EMPTY,
    edits: [
      { op: "set-remap", layer: "base", position: "caps", action: "esc" },
    ],
  },
};

const ctx = (over: Partial<ApplyContext>): ApplyContext => ({
  profile: 9,
  session: dirty,
  record: null,
  disk: { layout: EMPTY, led: null },
  ...over,
});

const MOUNTED = { dir: "/m", device: "/dev/x" };

const COPY = { dir: "/c", device: null };

describe("apply decision", () => {
  test.each<[WritePhase, string]>([
    [{ kind: "writing" }, "write-in-progress"],
    [{ kind: "ejected" }, "write-pending"],
  ])("given a %j record, when deciding, then it is %s", (phase, error) => {
    expect(() =>
      decideApply(ctx({ record: recordOf(9, phase) }), MOUNTED, "/b"),
    ).toThrow(expect.objectContaining({ error }));
  });

  test("given a written record for this profile on a device, when deciding, then only the eject is retried", () => {
    const record = recordOf(9, { kind: "written" });

    expect(decideApply(ctx({ record }), MOUNTED, "/b")).toEqual({
      kind: "retry-eject",
      record,
    });
  });

  test.each([
    ["for another profile", recordOf(1, { kind: "written" }), MOUNTED],
    ["under --source", recordOf(9, { kind: "written" }), COPY],
  ])(
    "given a written record %s, when deciding, then it is write-pending",
    (_, record, source) => {
      expect(() => decideApply(ctx({ record }), source, "/b")).toThrow(
        expect.objectContaining({ error: "write-pending" }),
      );
    },
  );

  test("given a failed record, when deciding, then the plan goes ahead", () => {
    const record = recordOf(9, { kind: "failed", step: "rename", error: "x" });

    expect(decideApply(ctx({ record }), MOUNTED, "/b").kind).toBe("plan");
  });

  test.each<[string, Partial<ApplyContext>, string]>([
    ["no session", { session: null }, "no-session"],
    [
      "a changed disk",
      { disk: { layout: "<base>\r\n", led: null } },
      "session-conflict",
    ],
    [
      "a render equal to the disk",
      { session: { profile: 9, layout: { baseText: EMPTY, edits: [] } } },
      "no-change",
    ],
  ])("given %s, when deciding, then it is %s", (_, over, error) => {
    expect(() => decideApply(ctx(over), MOUNTED, "/b")).toThrow(
      expect.objectContaining({ error }),
    );
  });

  test("given a dirty session, when deciding, then the plan names the file, the backup dir and the eject", () => {
    const decision = decideApply(ctx({}), MOUNTED, "/b");

    expect(decision).toMatchObject({
      kind: "plan",
      plan: {
        profile: 9,
        source: MOUNTED,
        backup_dir: "/b",
        eject: "/dev/x",
        files: [
          {
            rel: "layouts/layout9.txt",
            bytes: 34,
            content: expect.stringContaining("[caps]>[esc]"),
          },
        ],
      },
    });
  });
});

describe("plan report and record", () => {
  const decision = decideApply(ctx({}), COPY, "/b");
  const plan = decision.kind === "plan" ? decision.plan : null;

  test("given a plan, when describing it, then every side effect is named without file contents", () => {
    expect(plan && describePlan(plan)).toEqual({
      event: "plan",
      profile: 9,
      source: COPY,
      backup_dir: "/b",
      files: [{ rel: "layouts/layout9.txt", bytes: 34, creates: false }],
      eject: null,
    });
  });

  test("given a plan, when opening its record, then the phase is writing and the hashes are kept", () => {
    expect(plan && recordFor(plan, "t0")).toMatchObject({
      profile: 9,
      started_at: "t0",
      backup_dir: "/b",
      files: [
        {
          rel: "layouts/layout9.txt",
          before: expect.any(String),
          after: expect.any(String),
        },
      ],
      phase: { kind: "writing" },
    });
  });
});
