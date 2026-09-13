import { CliError } from "./errors.ts";
import { deriveState, render } from "./session.ts";
import type { SessionContext, SessionState } from "./session.ts";
import { KINDS, relOf } from "./source.ts";

export type DiffTarget = { rel: string; before: string; after: string };

export type DiffDecision = { state: SessionState; targets: DiffTarget[] };

export function diffTargets(ctx: SessionContext): DiffDecision {
  const { session, profile } = ctx;

  if (!session) {
    throw new CliError("no-session", `no edit session for profile ${profile}`);
  }

  const targets: DiffTarget[] = [];

  for (const kind of KINDS) {
    const part = session[kind];
    const after = render(session, kind);

    if (part && after !== null) {
      targets.push({ rel: relOf(kind, profile), before: part.baseText, after });
    }
  }

  return { state: deriveState(ctx), targets };
}
