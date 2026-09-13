import pkg from "../package.json";
import type { Deps, Observation } from "./deps.ts";
import { CliError } from "./errors.ts";
import { parseSettings } from "./settings.ts";
import { readText, SETTINGS_REL } from "./source.ts";
import type { Source } from "./source.ts";
import { loadRecord } from "./write.ts";
import type { WriteRecord } from "./write.ts";

export const VDRIVE_LABEL = "ADV360";

export const CHORD = {
  open: "SmartSet + Hotkey 3",
  reload: "SmartSet + Hotkey 4",
  close: "SmartSet + Hotkey 3",
} as const;

export type VDrive =
  | { state: "absent" }
  | { state: "ejected"; device: string }
  | { state: "mounted"; mount: string; device: string | null };

export function observe(o: Observation): VDrive {
  const dev = o.devices.find((d) => d.label === VDRIVE_LABEL);

  if (!dev) {
    return { state: "absent" };
  }

  return dev.mountpoint !== null && dev.mountpoint !== ""
    ? { state: "mounted", mount: dev.mountpoint, device: dev.path }
    : { state: "ejected", device: dev.path };
}

// ADV360_SOURCE plays --source for every verb: the GUI and the tests run against a copy.
export async function resolveSource(
  deps: Deps,
  sourceFlag: string | undefined,
): Promise<Source> {
  const dir = sourceFlag ?? process.env["ADV360_SOURCE"];

  if (dir !== undefined && dir !== "") {
    return { dir, device: null };
  }

  const v = observe(await deps.observe());

  if (v.state === "mounted") {
    return { dir: v.mount, device: v.device };
  }

  throw new CliError(
    "not-mounted",
    `open the v-Drive with ${CHORD.open}, or pass --source DIR`,
    { next: CHORD.open },
  );
}

export type ComposedState =
  | "absent"
  | "mounted"
  | "ejected"
  | "busy-writing"
  | "corrupt-suspected";

export type VDriveStatus = {
  state: ComposedState;
  observed: VDrive;
  active_profile: number | null;
  firmware: { left: string | null; right: string | null };
  pending_write: WriteRecord | null;
  next: string | null;
  version: string;
  stateDir: string;
};

export function composeState(
  observed: VDrive,
  record: WriteRecord | null,
): ComposedState {
  if (record?.phase.kind === "failed") {
    return "corrupt-suspected";
  }

  if (record?.phase.kind === "writing" || record?.phase.kind === "written") {
    return "busy-writing";
  }

  return observed.state;
}

export function nextStep(
  state: ComposedState,
  record: WriteRecord | null,
): string | null {
  switch (state) {
    case "absent":
      return `${CHORD.open} to open the v-Drive`;
    case "mounted":
      return record?.phase.kind === "ejected" ? "run adv360 verify" : null;
    case "ejected":
      return record?.phase.kind === "ejected"
        ? `${CHORD.reload} to reload, then ${CHORD.open} twice to reopen, then adv360 verify`
        : `${CHORD.close} twice to reopen the v-Drive`;
    case "busy-writing":
      return "wait for the write cycle, or run adv360 apply again to retry the eject";
    case "corrupt-suspected":
      return "compare with the backup (adv360 restore <backup-dir>) before using the keyboard";
    default:
      return state satisfies never;
  }
}

export async function vdriveStatus(deps: Deps): Promise<VDriveStatus> {
  const sourceEnv = process.env["ADV360_SOURCE"];

  const observed: VDrive =
    sourceEnv !== undefined && sourceEnv !== ""
      ? { state: "mounted", mount: sourceEnv, device: null }
      : observe(await deps.observe());

  const record = await loadRecord(deps.stateDir);
  const state = composeState(observed, record);

  const settingsText =
    observed.state === "mounted"
      ? await readText(observed.mount, SETTINGS_REL)
      : null;

  const settings = parseSettings(settingsText ?? "");

  return {
    state,
    observed,
    active_profile: settings.activeProfile,
    firmware: settings.firmware,
    pending_write: record,
    next: nextStep(state, record),
    version: pkg.version,
    stateDir: deps.stateDir,
  };
}

export type WatchStep = { changed: boolean; notify: boolean };

export function watchStep(prev: VDrive | null, next: VDrive): WatchStep {
  const changed = JSON.stringify(prev) !== JSON.stringify(next);

  return {
    changed,
    notify: changed && prev?.state === "absent" && next.state === "mounted",
  };
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
