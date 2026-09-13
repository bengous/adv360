import { rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { CliError, messageOf } from "../errors.ts";
import { backup, backupDir } from "../io/backup.ts";
import type { Deps } from "../io/deps.ts";
import { readDisk, readText, syncDir, writeSynced } from "../io/disk.ts";
import {
  clearRecord,
  createRecord,
  loadContext,
  saveRecord,
  saveSession,
} from "../io/state.ts";
import { decideApply, describePlan, recordFor } from "../model/plan.ts";
import type { Plan } from "../model/plan.ts";
import { sha256, withPhase } from "../model/record.ts";
import type { ApplyReport, FailedStep, WriteRecord } from "../model/record.ts";
import type { Profile, Source } from "../model/source.ts";
import { ejectAfterWrite } from "./status.ts";

export type DryRunReport = { event: "dry-run"; profile: Profile };

export async function applySession(
  deps: Deps,
  profile: Profile,
  source: Source,
  dryRun: boolean,
): Promise<ApplyReport | DryRunReport> {
  const disk = await readDisk(source.dir, profile);
  const ctx = await loadContext(deps.stateDir, profile, disk);
  const dir = backupDir(deps.stateDir, deps.now());
  const decision = decideApply(ctx, source, dir);

  if (decision.kind === "retry-eject") {
    deps.emit(JSON.stringify({ event: "retry-eject", device: source.device }));

    return ejectAfterWrite(deps, decision.record);
  }

  deps.emit(JSON.stringify(describePlan(decision.plan)));

  if (dryRun) {
    return { event: "dry-run", profile };
  }

  return executePlan(deps, decision.plan, ctx.record);
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
