import { describe, expect, test } from "bun:test";

import { recordOf } from "./testkit.ts";
import { decideVerify, pendingRecord } from "./verdict.ts";
import type { VerifyResult } from "./verdict.ts";

const record = () => ({
  ...recordOf(9, { kind: "ejected" }),
  files: [
    { rel: "layouts/layout9.txt", before: "old", after: "new" },
    { rel: "lighting/led9.txt", before: null, after: "led" },
  ],
});

describe("verify decision", () => {
  test.each<[(string | null)[], VerifyResult]>([
    [["new", "led"], "verified"],
    [["old", null], "unchanged"],
    [["new", null], "mismatch"],
    [["zzz", "led"], "mismatch"],
    [[null, null], "mismatch"],
  ])(
    "given on-disk hashes %j, when deciding, then the result is %s",
    (hashes, result) => {
      expect(decideVerify(record(), hashes).result).toBe(result);
    },
  );

  test("given a record, when deciding, then every file reports expected and actual", () => {
    expect(decideVerify(record(), ["new"]).files).toEqual([
      { rel: "layouts/layout9.txt", expected: "new", actual: "new" },
      { rel: "lighting/led9.txt", expected: "led", actual: null },
    ]);
  });

  test.each([null, recordOf(9, { kind: "writing" })])(
    "given record %j, when looking for a pending write, then it is no-write-record",
    (value) => {
      expect(() => pendingRecord(value)).toThrow("nothing to verify");
    },
  );
});
