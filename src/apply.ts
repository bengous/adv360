import { rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { backup, backupDir } from "./backup.ts";
import type { Deps } from "./deps.ts";
import { readDisk, readText, sha256, syncDir, writeSynced } from "./disk.ts";
import { CliError } from "./errors.ts";
import { decideApply, describePlan, recordFor } from "./plan.ts";
import type { ApplyReport, Plan } from "./plan.ts";
import { withPhase } from "./record.ts";
import type { FailedStep, WriteRecord } from "./record.ts";
import type { Profile, Source } from "./source.ts";
import {
  clearRecord,
  createRecord,
  loadContext,
  saveRecord,
  saveSession,
} from "./state.ts";
import { ejectAfterWrite } from "./status.ts";

export type DryRunReport = { event: "dry-run"; profile: Profile };

export async function applyVerb(
  deps: Deps,
  profile: Profile,
  source: Source,
  dryRun: boolean,
): Promise<ApplyReport | DryRunReport> {
  const disk = await readDisk(source.dir, profile);
  const ctx = await loadContext(deps.stateDir, profile, disk);
  const decision = decideApply(
    ctx,
    source,
    backupDir(deps.stateDir, deps.now()),
  );

  if (decision.kind === "retry-eject") {
    console.log(
      JSON.stringify({ event: "retry-eject", device: source.device }),
    );

    return ejectAfterWrite(deps, decision.record);
  }

  console.log(JSON.stringify(describePlan(decision.plan)));

  if (dryRun) {
    return { event: "dry-run", profile };
  }

  return executePlan(deps, decision.plan, ctx.record);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function tmpOf(plan: Plan, rel: string): string {
  return join(plan.source.dir, dirname(rel), `.${basename(rel)}.adv360-tmp`);
}

// A failed record never blocks a new cycle: restoring from the backup must stay possible.
async function lockRecord(
  deps: Deps,
  record: WriteRecord,
  prior: WriteRecord | null,
): Promise<void> {
  if (prior?.phase.kind === "failed") {
    await clearRecord(deps.stateDir);
  }

  await createRecord(deps.stateDir, record);
}

async function backupStep(deps: Deps, plan: Plan): Promise<void> {
  try {
    await backup(plan.source.dir, plan.backup_dir);
  } catch (error) {
    await clearRecord(deps.stateDir);

    throw error instanceof CliError
      ? error
      : new CliError("backup-failed", messageOf(error));
  }
}

async function writeTmps(deps: Deps, plan: Plan): Promise<void> {
  try {
    for (const f of plan.files) {
      await writeSynced(tmpOf(plan, f.rel), f.content);
    }
  } catch (error) {
    for (const f of plan.files) {
      await rm(tmpOf(plan, f.rel), { force: true });
    }

    await clearRecord(deps.stateDir);
    throw new CliError("write-failed", messageOf(error));
  }
}

// Past the rename the volume may hold a half-written profile: the record says so until verify.
async function fail(
  deps: Deps,
  record: WriteRecord,
  step: FailedStep,
  error: string,
): Promise<never> {
  await saveRecord(
    deps.stateDir,
    withPhase(record, { kind: "failed", step, error }),
  );

  throw new CliError(
    "corrupt-suspected",
    `${step} failed: ${error}; backup at ${record.backup_dir}`,
    { step, backup_dir: record.backup_dir },
  );
}

async function commitFiles(
  deps: Deps,
  plan: Plan,
  record: WriteRecord,
): Promise<void> {
  for (const f of plan.files) {
    try {
      await rename(tmpOf(plan, f.rel), join(plan.source.dir, f.rel));
      await syncDir(join(plan.source.dir, dirname(f.rel)));
    } catch (error) {
      await fail(deps, record, "rename", messageOf(error));
    }
  }
}

async function readBack(
  deps: Deps,
  plan: Plan,
  record: WriteRecord,
): Promise<void> {
  for (const f of plan.files) {
    const back = await readText(plan.source.dir, f.rel);

    if (back === null || sha256(back) !== f.after) {
      await fail(
        deps,
        record,
        "readback",
        `${f.rel} differs from what was written`,
      );
    }
  }
}

export async function executePlan(
  deps: Deps,
  plan: Plan,
  prior: WriteRecord | null,
): Promise<ApplyReport> {
  const record = recordFor(plan, deps.now().toISOString());
  await lockRecord(deps, record, prior);
  await backupStep(deps, plan);
  await writeTmps(deps, plan);
  await commitFiles(deps, plan, record);
  await readBack(deps, plan, record);

  if (plan.eject === null) {
    await clearRecord(deps.stateDir);
    await saveSession(deps.stateDir, { profile: plan.profile });

    return {
      event: "applied",
      profile: plan.profile,
      backup_dir: plan.backup_dir,
      files: plan.files.map((f) => f.rel),
      outcome: { kind: "verified-by-readback" },
    };
  }

  const written = withPhase(record, { kind: "written" });
  await saveRecord(deps.stateDir, written);

  return ejectAfterWrite(deps, written);
}
