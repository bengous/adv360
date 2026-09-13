import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createRecord,
  loadRecord,
  loadSession,
  recordPath,
  saveRecord,
  saveSession,
} from "./state.ts";
import { recordOf, rejection } from "./testkit.ts";
import { parseTapHoldMs } from "./txt/layout.ts";

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "adv360-state-"));
});

describe("write record file", () => {
  test("given a recorded cycle, when creating another, then it is write-in-progress", async () => {
    await createRecord(stateDir, recordOf(9, { kind: "writing" }));

    const failure = await rejection(
      createRecord(stateDir, recordOf(1, { kind: "writing" })),
    );

    expect(failure.message).toContain("another write cycle");
  });

  test("given a writing record left behind, when loading it, then it is marked died on disk", async () => {
    await saveRecord(stateDir, recordOf(9, { kind: "writing" }));
    const loaded = await loadRecord(stateDir);

    expect(loaded?.phase).toEqual({
      kind: "failed",
      step: "died",
      error: "writer did not finish",
    });
    expect((await loadRecord(stateDir))?.phase.kind).toBe("failed");
  });

  test("given no file, when loading, then it is null", async () => {
    expect(await loadRecord(stateDir)).toBeNull();
  });

  test("given a corrupt file, when loading, then it is bad-json", async () => {
    await Bun.write(recordPath(stateDir), '{"profile": "nine"}');

    expect(await rejection(loadRecord(stateDir))).toMatchObject({
      error: "bad-json",
    });
  });
});

describe("session file", () => {
  test("given a session with edits, when saving and loading, then the value objects come back", async () => {
    const session = {
      profile: 9 as const,
      layout: {
        baseText: "<base>\r\n",
        edits: [
          {
            op: "set-taphold" as const,
            layer: "base" as const,
            position: "a",
            tap: "a",
            ms: parseTapHoldMs("50"),
            hold: "b",
          },
        ],
      },
    };

    await saveSession(stateDir, session);

    expect(await loadSession(stateDir, 9)).toEqual(session);
  });

  test("given a session without parts, when saving, then the file is removed", async () => {
    await saveSession(stateDir, {
      profile: 9,
      led: { baseText: "", edits: [] },
    });
    await saveSession(stateDir, { profile: 9 });

    expect(await loadSession(stateDir, 9)).toBeNull();
  });

  test("given an unknown edit op on disk, when loading, then it is bad-json", async () => {
    await Bun.write(
      join(stateDir, "sessions/profile-9.json"),
      '{"profile":9,"layout":{"baseText":"","edits":[{"op":"frob"}]}}',
    );

    expect((await rejection(loadSession(stateDir, 9))).message).toContain(
      "edit op is frob",
    );
  });
});
