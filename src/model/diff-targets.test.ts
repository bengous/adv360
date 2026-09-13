import { describe, expect, test } from "bun:test";

import { CliError } from "../errors.ts";
import { diffTargets } from "./diff-targets.ts";
import type { SessionContext } from "./session.ts";

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
