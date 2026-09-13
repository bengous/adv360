import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { adv, FIXTURES, mountFixture, str } from "../testkit.ts";
import type { Fixture } from "../testkit.ts";

describe("restore from a backup", () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await mountFixture();
  });

  test("given a backup dir, when restoring, then both files open replace-file edits and diff shows the change", async () => {
    const made = await adv(fx.deps, "backup");
    await Bun.write(
      join(fx.mount, "layouts/layout9.txt"),
      "<base>\r\n[q]>[w]\r\n",
    );

    const restored = await adv(
      fx.deps,
      "restore",
      str(made.last, "backup_dir"),
      "--profile",
      "9",
    );

    const diff = await adv(fx.deps, "diff", "--profile", "9");

    expect(restored.last).toMatchObject({
      state: "dirty",
      layout: { edits: [{ op: "replace-file" }] },
      led: { edits: [{ op: "replace-file" }] },
    });
    expect(diff.last["files"]).toEqual([
      { rel: "layouts/layout9.txt", diff: expect.stringContaining("-[q]>[w]") },
      { rel: "lighting/led9.txt", diff: "" },
    ]);
  });

  test("given one .txt file, when restoring, then only the layout part opens", async () => {
    const from = join(FIXTURES, "layouts/layout1.txt.backup");
    const reply = await adv(fx.deps, "restore", from, "--profile", "9");

    expect(reply.last).toMatchObject({
      layout: {
        edits: [
          {
            op: "replace-file",
            text: expect.stringContaining("[rctr]>[caxx]"),
          },
        ],
      },
      led: null,
    });
  });

  test("given a missing path, when restoring, then it is restore-source-missing", async () => {
    const reply = await adv(
      fx.deps,
      "restore",
      join(fx.root, "nowhere"),
      "--profile",
      "9",
    );

    expect(reply.last["error"]).toBe("restore-source-missing");
  });
});
