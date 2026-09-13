import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Deps } from "./deps.ts";
import { readDisk } from "./disk.ts";
import { CliError } from "./errors.ts";
import { deriveState, render } from "./session.ts";
import type { SessionContext, SessionState } from "./session.ts";
import { KINDS, relOf } from "./source.ts";
import type { Profile, Source } from "./source.ts";
import { loadContext } from "./state.ts";

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

// GNU diff on two temp files: it keeps CRLF and prints the familiar unified format.
export async function diffFiles(
  stateDir: string,
  target: DiffTarget,
): Promise<string> {
  const tmp = join(stateDir, "tmp");
  await mkdir(tmp, { recursive: true });
  const a = join(tmp, `a-${basename(target.rel)}`);
  const b = join(tmp, `b-${basename(target.rel)}`);
  await Bun.write(a, target.before);
  await Bun.write(b, target.after);

  const proc = Bun.spawn(
    [
      "diff",
      "-u",
      "--label",
      `a/${target.rel}`,
      "--label",
      `b/${target.rel}`,
      a,
      b,
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 10_000 },
  );

  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  await rm(a, { force: true });
  await rm(b, { force: true });

  if (code > 1) {
    throw new CliError("diff-failed", await new Response(proc.stderr).text());
  }

  return out;
}

export type DiffReport = {
  profile: Profile;
  state: SessionState;
  files: { rel: string; diff: string }[];
};

export async function diffVerb(
  deps: Deps,
  profile: Profile,
  source: Source | null,
): Promise<DiffReport> {
  const disk = source ? await readDisk(source.dir, profile) : null;
  const ctx = await loadContext(deps.stateDir, profile, disk);
  const { state, targets } = diffTargets(ctx);
  const files: DiffReport["files"] = [];

  for (const target of targets) {
    files.push({
      rel: target.rel,
      diff: await diffFiles(deps.stateDir, target),
    });
  }

  return { profile, state, files };
}
