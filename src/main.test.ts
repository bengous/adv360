import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { decodeObject } from "./io/decode.ts";
import { fakeDeps } from "./io/deps-fake.ts";
import { run } from "./main.ts";
import { FIXTURES } from "./testkit.ts";

const call = async (...argv: string[]) => {
  const deps = fakeDeps("/nowhere");
  const code = await run(argv, deps);

  return { code, out: deps.lines, err: deps.warnings };
};

describe("adv360 exit codes", () => {
  test("given a valid verb, when running, then exit 0 with one JSON line", async () => {
    const ok = await call(
      "view",
      "--source",
      FIXTURES,
      "--profile",
      "1",
      "--layer",
      "fn1",
    );

    expect(ok.code).toBe(0);
    expect(decodeObject(ok.out[0] ?? "", "line")).toMatchObject({
      layer: "function1",
    });
  });

  test.each([
    [["inspect"], "not-mounted"],
    [
      ["view", "--source", FIXTURES, "--profile", "12", "--layer", "base"],
      "bad-profile",
    ],
  ])(
    "given %j, when running, then exit 1 with error %s on stdout",
    async (argv, error) => {
      const reply = await call(...argv);

      expect(reply.code).toBe(1);
      expect(decodeObject(reply.out[0] ?? "", "line")).toMatchObject({ error });
    },
  );

  test.each([
    ["frob"],
    ["view", "--source", FIXTURES, "--profile", "1", "--layer", "nope"],
    ["inspect", "--bogus"],
    [],
  ])(
    "given %j, when running, then exit 2 with the usage on stderr",
    async (...argv) => {
      const reply = await call(...argv);

      expect(reply.code).toBe(2);
      expect(reply.out).toEqual([]);
      expect(reply.err[0]).toContain("usage:");
    },
  );

  test("given the binary entry point, when a verb is unknown, then the process exits 2", async () => {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "main.ts"), "frob"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(await proc.exited).toBe(2);
  });
});
