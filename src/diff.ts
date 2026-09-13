import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Deps } from "./deps.ts";
import { diffTargets } from "./diff-targets.ts";
import type { DiffTarget } from "./diff-targets.ts";
import { readDisk } from "./disk.ts";
import { CliError } from "./errors.ts";
import type { SessionState } from "./session.ts";
import type { Profile, Source } from "./source.ts";
import { loadContext } from "./state.ts";

async function writeSides(
  stateDir: string,
  target: DiffTarget,
): Promise<[string, string]> {
  const tmp = join(stateDir, "tmp");
  await mkdir(tmp, { recursive: true });
  const a = join(tmp, `a-${basename(target.rel)}`);
  const b = join(tmp, `b-${basename(target.rel)}`);
  await Bun.write(a, target.before);
  await Bun.write(b, target.after);

  return [a, b];
}

// GNU diff on two temp files: it keeps CRLF and prints the familiar unified format.
export async function diffFiles(
  stateDir: string,
  target: DiffTarget,
): Promise<string> {
  const [a, b] = await writeSides(stateDir, target);

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

export async function diffSession(
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
