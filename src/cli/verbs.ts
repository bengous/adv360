import { applySession } from "../app/apply.ts";
import { diffSession } from "../app/diff.ts";
import { inspect } from "../app/inspect.ts";
import { restore } from "../app/restore.ts";
import {
  discardSession,
  editSession,
  loadFileEdit,
  sessionStatus,
} from "../app/session-edit.ts";
import { findSource, findSourceOrNull } from "../app/status.ts";
import { verify } from "../app/verify.ts";
import { viewSession } from "../app/view.ts";
import { UsageError } from "../errors.ts";
import { backup, backupDir } from "../io/backup.ts";
import type { Deps } from "../io/deps.ts";
import type { Json } from "../io/json.ts";
import type { Edit } from "../model/edit.ts";
import { parseProfile } from "../model/source.ts";
import { parseLayerName } from "../model/txt/layout.ts";
import { need } from "./flags.ts";
import type { Flags } from "./flags.ts";
import { editFromFlags } from "./session-flags.ts";

// One adapter per verb: flags in, use case out. The profile is parsed before the source is looked up.
export type Verb = (
  deps: Deps,
  flags: Flags,
  positionals: string[],
) => Promise<Json>;

export const inspectVerb: Verb = async (deps, flags) => {
  const source = await findSource(deps, flags.source);
  const { profile } = flags;

  return inspect(
    source.dir,
    profile === undefined ? undefined : parseProfile(profile),
  );
};

export const viewVerb: Verb = async (deps, flags) => {
  const profile = parseProfile(flags.profile);
  const source = await findSource(deps, flags.source);
  const layer = parseLayerName(need(flags, "layer"));

  return viewSession(deps, source, profile, layer);
};

function sessionEditOf(op: string, flags: Flags): Promise<Edit | null> {
  switch (op) {
    case "status":
    case "discard":
      return Promise.resolve(null);
    case "load-file":
      return loadFileEdit(need(flags, "from"), flags.kind);
    default:
      return Promise.resolve(editFromFlags(op, flags));
  }
}

export const sessionVerb: Verb = async (deps, flags, positionals) => {
  const op = positionals[1] ?? "";
  const profile = parseProfile(flags.profile);
  const edit = await sessionEditOf(op, flags);
  const source = await findSourceOrNull(deps, flags.source);

  if (edit !== null) {
    return editSession(deps, profile, source, edit);
  }

  return op === "discard"
    ? discardSession(deps, profile, source)
    : sessionStatus(deps, profile, source);
};

export const diffVerb: Verb = async (deps, flags) => {
  const profile = parseProfile(flags.profile);

  return diffSession(deps, profile, await findSourceOrNull(deps, flags.source));
};

export const applyVerb: Verb = async (deps, flags) => {
  const profile = parseProfile(flags.profile);
  const source = await findSource(deps, flags.source);

  return applySession(deps, profile, source, flags["dry-run"] === true);
};

export const verifyVerb: Verb = async (deps, flags) =>
  verify(deps, await findSource(deps, flags.source));

export const backupVerb: Verb = async (deps, flags) => {
  const source = await findSource(deps, flags.source);

  return backup(source.dir, backupDir(deps.stateDir, deps.now()));
};

export const restoreVerb: Verb = async (deps, flags, positionals) => {
  const from = positionals[1];

  if (from === undefined || from === "") {
    throw new UsageError("restore needs a backup dir or a .txt file");
  }

  const profile = parseProfile(flags.profile);

  return restore(deps, await findSource(deps, flags.source), profile, from);
};
