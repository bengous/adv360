import type { Profile, Source } from "./source.ts";

export const STEPS = ["rename", "readback", "verify", "died"] as const;

export type FailedStep = (typeof STEPS)[number];

export type WritePhase =
  | { kind: "writing" }
  | { kind: "written" }
  | { kind: "ejected" }
  | { kind: "failed"; step: FailedStep; error: string };

export type WrittenFile = { rel: string; before: string | null; after: string };

export type WriteRecord = {
  profile: Profile;
  started_at: string;
  backup_dir: string;
  source: Source;
  files: WrittenFile[];
  phase: WritePhase;
};

export function withPhase(record: WriteRecord, phase: WritePhase): WriteRecord {
  return { ...record, phase };
}

// A writing record seen by a later invocation means the writer died: the cycle lasts milliseconds.
export function markDied(record: WriteRecord): WriteRecord {
  return record.phase.kind === "writing"
    ? withPhase(record, {
        kind: "failed",
        step: "died",
        error: "writer did not finish",
      })
    : record;
}

export type ApplyOutcome =
  | { kind: "ejected"; next: string }
  | { kind: "verified-by-readback" };

export type ApplyReport = {
  event: "applied";
  profile: Profile;
  backup_dir: string;
  files: string[];
  outcome: ApplyOutcome;
};

export function sha256(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}
