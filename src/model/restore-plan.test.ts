import { describe, expect, test } from "bun:test";

import { decideRestore } from "./restore-plan.ts";
import type { SessionContext } from "./session.ts";

const ctx = (): SessionContext => ({
  profile: 9,
  session: null,
  record: null,
  disk: { layout: "<base>\r\n", led: "" },
});

describe("restore decision", () => {
  test("given no candidate file, when restoring, then it is restore-source-missing", () => {
    expect(() => decideRestore(ctx(), [], "/nowhere")).toThrow(
      "no layout9.txt or led9.txt under /nowhere",
    );
  });

  test("given a layout and a led file, when restoring, then both parts open a replace-file edit", () => {
    const session = decideRestore(
      ctx(),
      [
        { path: "/b/layouts/layout9.txt", text: "<base>\r\n[a]>[b]\r\n" },
        { path: "/b/lighting/led9.txt", text: "[IND1]>[caps][1][1][1]\r\n" },
      ],
      "/b",
    );

    expect(session).toEqual({
      profile: 9,
      layout: {
        baseText: "<base>\r\n",
        edits: [{ op: "replace-file", text: "<base>\r\n[a]>[b]\r\n" }],
      },
      led: {
        baseText: "",
        edits: [{ op: "replace-file", text: "[IND1]>[caps][1][1][1]\r\n" }],
      },
    });
  });
});
