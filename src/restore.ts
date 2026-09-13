import { basename, dirname, join } from "node:path";

import type { Deps } from "./deps.ts";
import { readDisk, readText } from "./disk.ts";
import { assertEditable, decideEdit, sessionStatusOf } from "./edit.ts";
import type { SessionStatus } from "./edit.ts";
import { CliError } from "./errors.ts";
import { deriveState } from "./session.ts";
import type { Session, SessionContext } from "./session.ts";
import { KINDS, kindOfName, relOf } from "./source.ts";
import type { Profile, Source } from "./source.ts";
import { loadContext, saveSession } from "./state.ts";

export type FoundFile = { path: string; text: string };

// Each found file opens a replace-file edit; the kind comes from the file name.
export function decideRestore(
  ctx: SessionContext,
  found: FoundFile[],
  from: string,
): Session {
  assertEditable(deriveState(ctx));

  if (found.length === 0) {
    throw new CliError(
      "restore-source-missing",
      `no layout${ctx.profile}.txt or led${ctx.profile}.txt under ${from}`,
    );
  }

  let session = ctx.session;

  for (const { path, text } of found) {
    session = decideEdit(
      { ...ctx, session },
      { kind: kindOfName(path), edit: { op: "replace-file", text } },
    );
  }

  return session ?? { profile: ctx.profile };
}

// `from` is one .txt file, or a backup dir holding the profile's files.
async function findFiles(from: string, profile: Profile): Promise<FoundFile[]> {
  const single = await readText(dirname(from), basename(from));

  if (single !== null) {
    return [{ path: from, text: single }];
  }

  const found: FoundFile[] = [];

  for (const kind of KINDS) {
    const rel = relOf(kind, profile);
    const text = await readText(from, rel);

    if (text !== null) {
      found.push({ path: join(from, rel), text });
    }
  }

  return found;
}

export async function restore(
  deps: Deps,
  source: Source,
  profile: Profile,
  from: string,
): Promise<SessionStatus> {
  const disk = await readDisk(source.dir, profile);
  const ctx = await loadContext(deps.stateDir, profile, disk);
  const found = await findFiles(from, profile);
  const session = decideRestore(ctx, found, from);
  await saveSession(deps.stateDir, session);

  return sessionStatusOf({ ...ctx, session }, source);
}
