import type { Deps } from "./deps.ts";
import { readText, sha256 } from "./disk.ts";
import { CliError } from "./errors.ts";
import { withPhase } from "./record.ts";
import type { WriteRecord } from "./record.ts";
import type { Profile, Source } from "./source.ts";
import { clearRecord, loadRecord, saveRecord, saveSession } from "./state.ts";

export type VerifyResult = "verified" | "unchanged" | "mismatch";

export type VerifiedFile = {
  rel: string;
  expected: string;
  actual: string | null;
};

export type VerifyReport = {
  result: VerifyResult;
  profile: Profile;
  files: VerifiedFile[];
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

async function hashesOf(
  source: Source,
  record: WriteRecord,
): Promise<(string | null)[]> {
  const hashes: (string | null)[] = [];

  for (const f of record.files) {
    const text = await readText(source.dir, f.rel);
    hashes.push(text === null ? null : sha256(text));
  }

  return hashes;
}

async function applyVerdict(deps: Deps, verdict: Verdict): Promise<void> {
  const { record } = verdict;

  switch (verdict.result) {
    case "verified":
      await clearRecord(deps.stateDir);
      await saveSession(deps.stateDir, { profile: record.profile });
      break;
    case "unchanged":
      await clearRecord(deps.stateDir);
      break;
    case "mismatch":
      await saveRecord(
        deps.stateDir,
        withPhase(record, {
          kind: "failed",
          step: "verify",
          error: "on-disk files match neither the write nor the backup",
        }),
      );
      break;
    default:
      verdict.result satisfies never;
  }
}

export async function verify(
  deps: Deps,
  source: Source,
): Promise<VerifyReport> {
  const record = pendingRecord(await loadRecord(deps.stateDir));
  const verdict = decideVerify(record, await hashesOf(source, record));
  await applyVerdict(deps, verdict);

  return {
    result: verdict.result,
    profile: record.profile,
    files: verdict.files,
  };
}
