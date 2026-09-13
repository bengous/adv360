import { CliError } from "../errors.ts";
import { sha256 } from "./record.ts";
import type { WriteRecord } from "./record.ts";
import { deriveState, render } from "./session.ts";
import type { Session, SessionContext } from "./session.ts";
import { KINDS, relOf } from "./source.ts";
import type { Disk, Profile, Source } from "./source.ts";

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

export type ApplyDecision =
  | { kind: "retry-eject"; record: WriteRecord }
  | { kind: "plan"; plan: Plan };

export type ApplyContext = SessionContext & { disk: Disk };

function assertNoCycle(record: WriteRecord | null): void {
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
}

function plannedFiles(
  session: Session,
  disk: Disk,
  profile: Profile,
): PlannedFile[] {
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

  return files;
}

// A written record for the same profile means the eject failed: only the eject is retried.
function ejectToRetry(ctx: ApplyContext, source: Source): WriteRecord | null {
  const { record, profile } = ctx;

  return record?.phase.kind === "written" &&
    record.profile === profile &&
    source.device !== null &&
    source.device !== ""
    ? record
    : null;
}

function sessionToApply(ctx: ApplyContext): Session {
  const { session, profile } = ctx;

  if (!session) {
    throw new CliError("no-session", `no edit session for profile ${profile}`);
  }

  if (deriveState(ctx) === "conflict") {
    throw new CliError(
      "session-conflict",
      "the file changed on disk since the session started; discard the session",
    );
  }

  return session;
}

export function decideApply(
  ctx: ApplyContext,
  source: Source,
  backupDir: string,
): ApplyDecision {
  const record = ejectToRetry(ctx, source);

  if (record !== null) {
    return { kind: "retry-eject", record };
  }

  assertNoCycle(ctx.record);
  const { profile } = ctx;
  const files = plannedFiles(sessionToApply(ctx), ctx.disk, profile);

  if (files.length === 0) {
    throw new CliError(
      "no-change",
      "the session renders the same bytes as the disk",
    );
  }

  return {
    kind: "plan",
    plan: {
      profile,
      source,
      backup_dir: backupDir,
      files,
      eject: source.device,
    },
  };
}

export type PlanReport = {
  event: "plan";
  profile: Profile;
  source: Source;
  backup_dir: string;
  files: { rel: string; bytes: number; creates: boolean }[];
  eject: string | null;
};

export function describePlan(plan: Plan): PlanReport {
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

export function recordFor(plan: Plan, startedAt: string): WriteRecord {
  return {
    profile: plan.profile,
    started_at: startedAt,
    backup_dir: plan.backup_dir,
    source: plan.source,
    files: plan.files.map(({ rel, before, after }) => ({ rel, before, after })),
    phase: { kind: "writing" },
  };
}
