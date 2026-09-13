import { badJson, field } from "./decode.ts";
import { isArray, isNumber, isObject, isString, orNull } from "./json.ts";
import type { Json, JsonObject } from "./json.ts";
import { parseProfile, parseSource } from "./source.ts";
import type { Profile, Source } from "./source.ts";

const STEPS = ["rename", "readback", "verify", "died"] as const;

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

const WHAT = "write.json";

function isStep(value: Json | undefined): value is FailedStep {
  return STEPS.some((step) => step === value);
}

function parsePhase(object: JsonObject): WritePhase {
  const kind = field(object, "kind", isString, WHAT);

  switch (kind) {
    case "writing":
    case "written":
    case "ejected":
      return { kind };
    case "failed":
      return {
        kind,
        step: field(object, "step", isStep, WHAT),
        error: field(object, "error", isString, WHAT),
      };
    default:
      throw badJson(WHAT, `phase.kind is ${kind}`);
  }
}

function parseWrittenFile(value: Json): WrittenFile {
  if (!isObject(value)) {
    throw badJson(WHAT, "files holds a non-object");
  }

  return {
    rel: field(value, "rel", isString, WHAT),
    before: field(value, "before", orNull(isString), WHAT),
    after: field(value, "after", isString, WHAT),
  };
}

export function parseRecord(object: JsonObject): WriteRecord {
  return {
    profile: parseProfile(String(field(object, "profile", isNumber, WHAT))),
    started_at: field(object, "started_at", isString, WHAT),
    backup_dir: field(object, "backup_dir", isString, WHAT),
    source: parseSource(field(object, "source", isObject, WHAT), WHAT),
    files: field(object, "files", isArray, WHAT).map(parseWrittenFile),
    phase: parsePhase(field(object, "phase", isObject, WHAT)),
  };
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
