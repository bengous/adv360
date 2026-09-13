import type { Deps } from "./deps.ts";
import { readText } from "./disk.ts";
import { CliError } from "./errors.ts";
import type { ApplyReport } from "./plan.ts";
import { withPhase } from "./record.ts";
import type { WriteRecord } from "./record.ts";
import { SETTINGS_REL } from "./source.ts";
import type { Source } from "./source.ts";
import { loadRecord, saveRecord } from "./state.ts";
import {
  CHORD,
  ejectTarget,
  mountedAt,
  observe,
  sourceOf,
  sourceOrNull,
  statusOf,
  watchStep,
} from "./vdrive.ts";
import type { VDrive, VDriveStatus } from "./vdrive.ts";

// ADV360_SOURCE plays --source for every verb: the GUI and the tests run against a copy.
export async function observeVDrive(
  deps: Deps,
  sourceFlag: string | undefined,
): Promise<VDrive> {
  const dir = sourceFlag ?? process.env["ADV360_SOURCE"];

  return dir !== undefined && dir !== ""
    ? mountedAt(dir)
    : observe(await deps.observe());
}

export async function findSource(
  deps: Deps,
  sourceFlag: string | undefined,
): Promise<Source> {
  return sourceOf(await observeVDrive(deps, sourceFlag));
}

export async function findSourceOrNull(
  deps: Deps,
  sourceFlag: string | undefined,
): Promise<Source | null> {
  return sourceOrNull(await observeVDrive(deps, sourceFlag));
}

export async function vdriveStatus(deps: Deps): Promise<VDriveStatus> {
  const observed = await observeVDrive(deps, undefined);
  const record = await loadRecord(deps.stateDir);

  const settingsText =
    observed.state === "mounted"
      ? await readText(observed.mount, SETTINGS_REL)
      : null;

  return statusOf(observed, record, settingsText, deps.stateDir);
}

export async function watch(
  deps: Deps,
  emit: (status: VDriveStatus) => void,
  intervalMs = 1000,
): Promise<never> {
  let prev: VDrive | null = null;

  for (;;) {
    const status = await vdriveStatus(deps);
    const step = watchStep(prev, status.observed);

    if (step.changed) {
      emit(status);
    }

    if (step.notify) {
      await deps.notify(
        "Advantage360 v-Drive connected",
        "adv360 gui to edit the keyboard",
        "normal",
      );
    }

    prev = status.observed;
    await Bun.sleep(intervalMs);
  }
}

export type EjectReport = { event: "ejected"; device: string; next: string };

export async function eject(deps: Deps): Promise<EjectReport> {
  const device = ejectTarget(await vdriveStatus(deps));
  await deps.unmount(device);

  return {
    event: "ejected",
    device,
    next: `${CHORD.close} to close the v-Drive`,
  };
}

export async function ejectAfterWrite(
  deps: Deps,
  record: WriteRecord,
): Promise<ApplyReport> {
  const device = record.source.device;

  if (device === null) {
    throw new CliError("eject-failed", "no device recorded for this write");
  }

  await deps.unmount(device);
  await saveRecord(deps.stateDir, withPhase(record, { kind: "ejected" }));
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
    outcome: {
      kind: "ejected",
      next: `${CHORD.reload} to reload, then ${CHORD.open} twice to reopen, then adv360 verify`,
    },
  };
}
