import { describe, expect, test } from "bun:test";

import { recordOf } from "../testkit.ts";
import { decideVerify, pendingRecord } from "./verdict.ts";
import type { VerifiedFile, VerifyResult } from "./verdict.ts";

const record = recordOf(9, { kind: "ejected" });

const onDisk = (layout: string | null, led: string | null): VerifiedFile[] => [
  {
    rel: "layouts/layout9.txt",
    before: "old",
    expected: "new",
    actual: layout,
  },
  { rel: "lighting/led9.txt", before: null, expected: "led", actual: led },
];

describe("verify decision", () => {
  test.each<[string | null, string | null, VerifyResult]>([
    ["new", "led", "verified"],
    ["old", null, "unchanged"],
    ["new", null, "mismatch"],
    ["zzz", "led", "mismatch"],
    [null, null, "mismatch"],
  ])(
    "given layout %j and led %j on disk, when deciding, then the result is %s",
    (layout, led, result) => {
      expect(decideVerify(record, onDisk(layout, led))).toEqual({
        record,
        result,
        files: onDisk(layout, led),
      });
    },
  );

  test.each([null, recordOf(9, { kind: "writing" })])(
    "given record %j, when looking for a pending write, then it is no-write-record",
    (value) => {
      expect(() => pendingRecord(value)).toThrow("nothing to verify");
    },
  );
});
