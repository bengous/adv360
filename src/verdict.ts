import { CliError } from "./errors.ts";
import type { WriteRecord } from "./record.ts";

export type VerifyResult = "verified" | "unchanged" | "mismatch";

export type VerifiedFile = {
  rel: string;
  expected: string;
  actual: string | null;
};

export type Verdict = {
  record: WriteRecord;
  result: VerifyResult;
  files: VerifiedFile[];
};

export function pendingRecord(record: WriteRecord | null): WriteRecord {
  if (!record) {
    throw new CliError("no-write-record", "nothing to verify");
  }

  if (record.phase.kind !== "written" && record.phase.kind !== "ejected") {
    throw new CliError(
      "no-write-record",
      `the recorded write is ${record.phase.kind}, nothing to verify`,
      { record },
    );
  }

  return record;
}

// verified: every file hashes as written; unchanged: as before the write; else mismatch.
export function decideVerify(
  record: WriteRecord,
  actualHashes: (string | null)[],
): Verdict {
  const files = record.files.map((f, i) => ({
    rel: f.rel,
    expected: f.after,
    actual: actualHashes[i] ?? null,
  }));

  const result: VerifyResult = files.every((f) => f.actual === f.expected)
    ? "verified"
    : files.every((f, i) => f.actual === record.files[i]?.before)
      ? "unchanged"
      : "mismatch";

  return { record, result, files };
}
