import type { Deps } from "../io/deps.ts";
import { readText } from "../io/disk.ts";
import {
  clearRecord,
  loadRecord,
  saveRecord,
  saveSession,
} from "../io/state.ts";
import { sha256, withPhase } from "../model/record.ts";
import type { WriteRecord } from "../model/record.ts";
import type { Profile, Source } from "../model/source.ts";
import { decideVerify, pendingRecord } from "../model/verdict.ts";
import type { Verdict, VerifiedFile, VerifyResult } from "../model/verdict.ts";

export type VerifyReport = {
  result: VerifyResult;
  profile: Profile;
  files: VerifiedFile[];
};

async function readFiles(
  source: Source,
  record: WriteRecord,
): Promise<VerifiedFile[]> {
  const files: VerifiedFile[] = [];

  for (const f of record.files) {
    const text = await readText(source.dir, f.rel);

    files.push({
      rel: f.rel,
      before: f.before,
      expected: f.after,
      actual: text === null ? null : sha256(text),
    });
  }

  return files;
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
  const verdict = decideVerify(record, await readFiles(source, record));
  await applyVerdict(deps, verdict);

  return {
    result: verdict.result,
    profile: record.profile,
    files: verdict.files,
  };
}
