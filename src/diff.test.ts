import { beforeEach, describe, expect, test } from "bun:test";

import { diffFiles } from "./diff.ts";
import { adv, mountFixture, setRemap } from "./testkit.ts";
import type { Fixture } from "./testkit.ts";

describe("diff files", () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await mountFixture();
  });

  test("given a session, when diffing, then GNU diff shows the added line with CRLF", async () => {
    await setRemap(fx.deps, {
      profile: 9,
      layer: "base",
      pos: "caps",
      action: "esc",
    });
    const reply = await adv(fx.deps, "diff", "--profile", "9");

    expect(reply.last["files"]).toEqual([
      {
        rel: "layouts/layout9.txt",
        diff: expect.stringContaining("+[caps]>[esc]\r\n"),
      },
    ]);
  });

  test("given identical texts, when diffing, then the output is empty", async () => {
    const target = { rel: "x.txt", before: "a\r\n", after: "a\r\n" };

    expect(await diffFiles(fx.deps.stateDir, target)).toBe("");
  });
});
