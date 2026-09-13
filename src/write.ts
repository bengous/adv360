import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { Deps } from "./deps.ts";
import { CliError } from "./errors.ts";
import {
  addEdit,
  assertEditable,
  deriveState,
  loadSession,
  render,
  saveSession,
} from "./session.ts";
import type { Session } from "./session.ts";
import { KINDS, kindOfName, readDisk, readText, relOf } from "./source.ts";
import type { Profile, Source } from "./source.ts";
import { CHORD } from "./vdrive.ts";

export type WritePhase =
  | { kind: "writing" }
  | { kind: "written" }
  | { kind: "ejected" }
  | {
      kind: "failed";
      step: "rename" | "readback" | "verify" | "died";
      error: string;
    };

export type WrittenFile = { rel: string; before: string | null; after: string };

export type WriteRecord = {
  profile: Profile;
  started_at: string;
  backup_dir: string;
  source: Source;
  files: WrittenFile[];
  phase: WritePhase;
};

export function sha256(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

export function recordPath(stateDir: string): string {
  return join(stateDir, "write.json");
}

// A writing record seen by a later invocation means the writer died: the cycle lasts milliseconds.
export async function loadRecord(
  stateDir: string,
): Promise<WriteRecord | null> {
  const file = Bun.file(recordPath(stateDir));

  if (!(await file.exists())) {
    return null;
  }

  const record = (await file.json()) as WriteRecord;

  if (record.phase.kind !== "writing") {
    return record;
  }

  const died: WriteRecord = {
    ...record,
    phase: { kind: "failed", step: "died", error: "writer did not finish" },
  };

  await saveRecord(stateDir, died);

  return died;
}

export async function saveRecord(
  stateDir: string,
  record: WriteRecord,
): Promise<void> {
  await Bun.write(recordPath(stateDir), `${JSON.stringify(record, null, 2)}\n`);
}

// The record file is the lock: wx fails when a cycle is already recorded.
async function createRecord(
  stateDir: string,
  record: WriteRecord,
): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  let fh;

  try {
    fh = await open(recordPath(stateDir), "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError(
        "write-in-progress",
        "another write cycle is recorded; run adv360 vdrive status",
      );
    }

    throw error;
  }

  await fh.writeFile(`${JSON.stringify(record, null, 2)}\n`);
  await fh.sync();
  await fh.close();
}

export async function clearRecord(stateDir: string): Promise<void> {
  await rm(recordPath(stateDir), { force: true });
}

async function writeSynced(path: string, content: string): Promise<void> {
  const fh = await open(path, "w");

  try {
    await fh.writeFile(content);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

async function syncDir(path: string): Promise<void> {
  const fh = await open(path, "r");

  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
}

export const BACKUP_SUBDIRS = ["layouts", "lighting", "settings"] as const;

export function backupStamp(now: Date): string {
  return now.toISOString().replaceAll(/[-:]|\.\d{3}/g, "");
}

export async function backup(
  sourceDir: string,
  stateDir: string,
  now: Date,
): Promise<{ backup_dir: string; files: string[] }> {
  const dir = join(stateDir, "backups", backupStamp(now));
  const files: string[] = [];

  for (const sub of BACKUP_SUBDIRS) {
    const names = await readdir(join(sourceDir, sub)).catch((): string[] => []);

    if (names.length === 0) {
      continue;
    }

    await mkdir(join(dir, sub), { recursive: true });

    for (const name of names.toSorted()) {
      const file = Bun.file(join(sourceDir, sub, name));

      if (file.size === 0 && !(await file.exists())) {
        continue;
      }

      await writeSynced(join(dir, sub, name), await file.text());
      files.push(`${sub}/${name}`);
    }

    await syncDir(join(dir, sub));
  }

  if (files.length === 0) {
    throw new CliError(
      "backup-failed",
      `nothing to back up under ${sourceDir}`,
    );
  }

  return { backup_dir: dir, files };
}

export type PlannedFile = {
  rel: string;
  before: string | null;
  after: string;
  bytes: number;
  content: string;
};

export type Plan = {
  profile: Profile;
  source: Source;
  backup_dir: string;
  files: PlannedFile[];
  eject: string | null;
};

export function describePlan(plan: Plan): Record<string, unknown> {
  return {
    event: "plan",
    profile: plan.profile,
    source: plan.source,
    backup_dir: plan.backup_dir,
    files: plan.files.map(({ rel, bytes, before }) => ({
      rel,
      bytes,
      creates: before === null,
    })),
    eject: plan.eject,
  };
}

export async function planApply(
  deps: Deps,
  source: Source,
  profile: Profile,
): Promise<Plan> {
  const record = await loadRecord(deps.stateDir);

  if (record?.phase.kind === "writing") {
    throw new CliError("write-in-progress", "a write cycle is running");
  }

  if (record?.phase.kind === "written" || record?.phase.kind === "ejected") {
    throw new CliError(
      "write-pending",
      `profile ${record.profile} awaits verification; run adv360 verify`,
      { record },
    );
  }

  const session = await loadSession(deps.stateDir, profile);

  if (!session) {
    throw new CliError("no-session", `no edit session for profile ${profile}`);
  }

  const disk = await readDisk(source.dir, profile);
  const state = deriveState(session, record, disk);

  if (state === "conflict") {
    throw new CliError(
      "session-conflict",
      "the file changed on disk since the session started; discard the session",
    );
  }

  const files: PlannedFile[] = [];

  for (const kind of KINDS) {
    const before = disk[kind];
    const content = render(session, kind);

    if (content === null || content === before) {
      continue;
    }

    files.push({
      rel: relOf(kind, profile),
      before: before === null ? null : sha256(before),
      after: sha256(content),
      bytes: Buffer.byteLength(content),
      content,
    });
  }

  if (files.length === 0) {
    throw new CliError(
      "no-change",
      "the session renders the same bytes as the disk",
    );
  }

  return {
    profile,
    source,
    backup_dir: join(deps.stateDir, "backups", backupStamp(deps.now())),
    files,
    eject: source.device,
  };
}

export type ApplyResult = {
  event: "applied";
  profile: Profile;
  backup_dir: string;
  files: string[];
  ejected: boolean;
  verified: boolean;
  next: string | null;
};

export async function executeApply(
  deps: Deps,
  plan: Plan,
): Promise<ApplyResult> {
  const record: WriteRecord = {
    profile: plan.profile,
    started_at: deps.now().toISOString(),
    backup_dir: plan.backup_dir,
    source: plan.source,
    files: plan.files.map(({ rel, before, after }) => ({ rel, before, after })),
    phase: { kind: "writing" },
  };

  // A failed record never blocks a new cycle: restoring from the backup must stay possible.
  if ((await loadRecord(deps.stateDir))?.phase.kind === "failed") {
    await clearRecord(deps.stateDir);
  }

  await createRecord(deps.stateDir, record);

  const fail = async (
    step: "rename" | "readback",
    error: string,
  ): Promise<never> => {
    await saveRecord(deps.stateDir, {
      ...record,
      phase: { kind: "failed", step, error },
    });
    throw new CliError(
      "corrupt-suspected",
      `${step} failed: ${error}; backup at ${plan.backup_dir}`,
      { step, backup_dir: plan.backup_dir },
    );
  };

  try {
    await backup(plan.source.dir, deps.stateDir, deps.now());
  } catch (error) {
    await clearRecord(deps.stateDir);

    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError(
      "backup-failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  const tmpOf = (rel: string) =>
    join(plan.source.dir, dirname(rel), `.${basename(rel)}.adv360-tmp`);

  try {
    for (const f of plan.files) {
      await writeSynced(tmpOf(f.rel), f.content);
    }
  } catch (error) {
    for (const f of plan.files) {
      await rm(tmpOf(f.rel), { force: true });
    }

    await clearRecord(deps.stateDir);
    throw new CliError(
      "write-failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  for (const f of plan.files) {
    try {
      await rename(tmpOf(f.rel), join(plan.source.dir, f.rel));
      await syncDir(join(plan.source.dir, dirname(f.rel)));
    } catch (error) {
      await fail(
        "rename",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  for (const f of plan.files) {
    const back = await readText(plan.source.dir, f.rel);

    if (back === null || sha256(back) !== f.after) {
      await fail("readback", `${f.rel} differs from what was written`);
    }
  }

  if (plan.eject === null) {
    await clearRecord(deps.stateDir);
    await rm(join(deps.stateDir, "sessions", `profile-${plan.profile}.json`), {
      force: true,
    });

    return {
      event: "applied",
      profile: plan.profile,
      backup_dir: plan.backup_dir,
      files: plan.files.map((f) => f.rel),
      ejected: false,
      verified: true,
      next: null,
    };
  }

  await saveRecord(deps.stateDir, { ...record, phase: { kind: "written" } });

  return ejectAfterWrite(deps, { ...record, phase: { kind: "written" } });
}

export async function ejectAfterWrite(
  deps: Deps,
  record: WriteRecord,
): Promise<ApplyResult> {
  const device = record.source.device;

  if (device === null) {
    throw new CliError("eject-failed", "no device recorded for this write");
  }

  await deps.unmount(device);
  await saveRecord(deps.stateDir, { ...record, phase: { kind: "ejected" } });
  const next = `${CHORD.reload} to reload, then ${CHORD.open} twice to reopen, then adv360 verify`;
  await deps.notify(
    `Profile ${record.profile} written`,
    `Press ${CHORD.reload}`,
    "normal",
  );

  return {
    event: "applied",
    profile: record.profile,
    backup_dir: record.backup_dir,
    files: record.files.map((f) => f.rel),
    ejected: true,
    verified: false,
    next,
  };
}

export type VerifyResult = {
  result: "verified" | "unchanged" | "mismatch";
  profile: Profile;
  files: { rel: string; expected: string; actual: string | null }[];
};

export async function verify(
  deps: Deps,
  source: Source,
): Promise<VerifyResult> {
  const record = await loadRecord(deps.stateDir);

  if (!record) {
    throw new CliError("no-write-record", "nothing to verify");
  }

  if (record.phase.kind !== "written" && record.phase.kind !== "ejected") {
    throw new CliError(
      "no-write-record",
      `the recorded write is ${record.phase.kind}, nothing to verify`,
      { record },
    );
  }

  const files = [];

  for (const f of record.files) {
    const text = await readText(source.dir, f.rel);
    files.push({
      rel: f.rel,
      expected: f.after,
      actual: text === null ? null : sha256(text),
    });
  }

  const result: VerifyResult["result"] = files.every(
    (f) => f.actual === f.expected,
  )
    ? "verified"
    : files.every((f, i) => f.actual === record.files[i]?.before)
      ? "unchanged"
      : "mismatch";

  switch (result) {
    case "verified":
      await clearRecord(deps.stateDir);
      await rm(
        join(deps.stateDir, "sessions", `profile-${record.profile}.json`),
        { force: true },
      );
      break;
    case "unchanged":
      await clearRecord(deps.stateDir);
      break;
    case "mismatch":
      await saveRecord(deps.stateDir, {
        ...record,
        phase: {
          kind: "failed",
          step: "verify",
          error: "on-disk files match neither the write nor the backup",
        },
      });
      break;
    default:
      result satisfies never;
  }

  return { result, profile: record.profile, files };
}

export async function diffFiles(
  stateDir: string,
  rel: string,
  before: string,
  after: string,
): Promise<string> {
  const tmp = join(stateDir, "tmp");
  await mkdir(tmp, { recursive: true });
  const a = join(tmp, `a-${basename(rel)}`);
  const b = join(tmp, `b-${basename(rel)}`);
  await Bun.write(a, before);
  await Bun.write(b, after);

  const proc = Bun.spawn(
    ["diff", "-u", "--label", `a/${rel}`, "--label", `b/${rel}`, a, b],
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

export async function restoreSession(
  deps: Deps,
  source: Source,
  profile: Profile,
  from: string,
): Promise<Session> {
  const record = await loadRecord(deps.stateDir);
  const disk = await readDisk(source.dir, profile);
  const session = await loadSession(deps.stateDir, profile);
  assertEditable(deriveState(session, record, disk));
  const stat = await Bun.file(from).exists();

  const candidates = stat
    ? [from]
    : KINDS.map((kind) => join(from, relOf(kind, profile)));

  let restored: Session | null = null;

  for (const path of candidates) {
    const file = Bun.file(path);

    if (!(await file.exists())) {
      continue;
    }

    const text = await file.text();
    restored = addEdit(
      restored ?? session,
      profile,
      { kind: kindOfName(path), edit: { op: "replace-file", text } },
      disk,
    );
  }

  if (!restored) {
    throw new CliError(
      "restore-source-missing",
      `no layout${profile}.txt or led${profile}.txt under ${from}`,
    );
  }

  await saveSession(deps.stateDir, restored);

  return restored;
}
