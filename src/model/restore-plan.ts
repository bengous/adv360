import { CliError } from "../errors.ts";
import { assertEditable, decideEdit } from "./edit.ts";
import { deriveState } from "./session.ts";
import type { Session, SessionContext } from "./session.ts";
import { kindOfName } from "./source.ts";

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
