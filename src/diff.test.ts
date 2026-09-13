import { beforeEach, describe, expect, test } from "bun:test";

import { diffFiles, diffTargets } from "./diff.ts";
import { CliError } from "./errors.ts";
import type { SessionContext } from "./session.ts";
import { adv, mountFixture, setRemap } from "./testkit.ts";
import type { Fixture } from "./testkit.ts";

const ctx = (session: SessionContext["session"]): SessionContext => ({
  profile: 9,
  session,
  record: null,
  disk: null,
});

describe("diff targets", () => {
  test("given no session, when diffing, then it is no-session", () => {
    expect(() => diffTargets(ctx(null))).toThrow(CliError);
  });

  test("given a layout session, when diffing, then one target carries base and render", () => {
    const decision = diffTargets(
      ctx({
        profile: 9,
        layout: {
          baseText: "<base>\r\n",
          edits: [
            { op: "set-remap", layer: "base", position: "a", action: "b" },
          ],
        },
      }),
    );

    expect(decision).toEqual({
      state: "dirty",
      targets: [
        {
          rel: "layouts/layout9.txt",
          before: "<base>\r\n",
          after: "<base>\r\n[a]>[b]\r\n",
        },
      ],
    });
  });
});

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
