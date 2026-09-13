import { basename, dirname } from "node:path";

import type { Deps } from "./deps.ts";
import { readDisk, readText } from "./disk.ts";
import { CliError, UsageError } from "./errors.ts";
import { decideEdit, sessionStatusOf } from "./session.ts";
import type { Edit, SessionStatus } from "./session.ts";
import { kindOfName } from "./source.ts";
import type { Profile, Source } from "./source.ts";
import { loadContext, saveSession } from "./state.ts";

export async function sessionStatus(
  deps: Deps,
  profile: Profile,
  source: Source | null,
): Promise<SessionStatus> {
  const disk = source ? await readDisk(source.dir, profile) : null;

  return sessionStatusOf(
    await loadContext(deps.stateDir, profile, disk),
    source,
  );
}

export async function editSession(
  deps: Deps,
  profile: Profile,
  source: Source | null,
  edit: Edit,
): Promise<SessionStatus> {
  const disk = source ? await readDisk(source.dir, profile) : null;
  const ctx = await loadContext(deps.stateDir, profile, disk);
  const session = decideEdit(ctx, edit);
  await saveSession(deps.stateDir, session);

  return sessionStatusOf({ ...ctx, session }, source);
}

export async function discardSession(
  deps: Deps,
  profile: Profile,
  source: Source | null,
): Promise<SessionStatus> {
  await saveSession(deps.stateDir, { profile });

  return sessionStatus(deps, profile, source);
}

export async function loadFileEdit(
  from: string,
  kindFlag: string | undefined,
): Promise<Edit> {
  const text = await readText(dirname(from), basename(from));

  if (text === null) {
    throw new CliError("file-missing", `${from} does not exist`);
  }

  const kind = kindFlag ?? kindOfName(from);

  if (kind !== "layout" && kind !== "led") {
    throw new UsageError("--kind must be layout or led");
  }

  return { kind, edit: { op: "replace-file", text } };
}
