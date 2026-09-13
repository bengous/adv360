import { STEPS } from "../model/record.ts";
import type {
  FailedStep,
  WritePhase,
  WriteRecord,
  WrittenFile,
} from "../model/record.ts";
import { parseProfile } from "../model/source.ts";
import type { Source } from "../model/source.ts";
import { badJson, field } from "./decode.ts";
import { isArray, isNumber, isObject, isString, orNull } from "./json.ts";
import type { Json, JsonObject } from "./json.ts";

function parseSource(object: JsonObject, what: string): Source {
  return {
    dir: field(object, "dir", isString, what),
    device: field(object, "device", orNull(isString), what),
  };
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
