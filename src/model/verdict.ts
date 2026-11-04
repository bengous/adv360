import { CliError } from "../errors.ts";
import type { WriteRecord } from "./record.ts";

export type VerifyResult = "verified" | "unchanged" | "mismatch";

export type VerifiedFile = {
  rel: string;
  before: string | null;
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
function verifyResult(files: readonly VerifiedFile[]): VerifyResult {
  if (files.every((f) => f.actual === f.expected)) {
    return "verified";
  }

  return files.every((f) => f.actual === f.before) ? "unchanged" : "mismatch";
}

export function decideVerify(
  record: WriteRecord,
  files: VerifiedFile[],
): Verdict {
  return { record, result: verifyResult(files), files };
}
