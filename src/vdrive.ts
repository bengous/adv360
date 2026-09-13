import pkg from "../package.json";
import { CliError } from "./errors.ts";
import type { WriteRecord } from "./record.ts";
import { parseSettings } from "./settings.ts";
import type { Source } from "./source.ts";

export type BlockDevice = {
  path: string;
  label: string | null;
  mountpoint: string | null;
};

// What lsblk reports, the input of every v-Drive decision.
export type Observation = { devices: BlockDevice[] };

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

// --source DIR or ADV360_SOURCE: a mounted volume with no device, nothing to eject.
export function mountedAt(dir: string): VDrive {
  return { state: "mounted", mount: dir, device: null };
}

export function sourceOrNull(observed: VDrive): Source | null {
  return observed.state === "mounted"
    ? { dir: observed.mount, device: observed.device }
    : null;
}

export function sourceOf(observed: VDrive): Source {
  const source = sourceOrNull(observed);

  if (source === null) {
    throw new CliError(
      "not-mounted",
      `open the v-Drive with ${CHORD.open}, or pass --source DIR`,
      { next: CHORD.open },
    );
  }

  return source;
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

export function statusOf(
  observed: VDrive,
  record: WriteRecord | null,
  settingsText: string | null,
  stateDir: string,
): VDriveStatus {
  const state = composeState(observed, record);
  const settings = parseSettings(settingsText ?? "");

  return {
    state,
    observed,
    active_profile: settings.activeProfile,
    firmware: settings.firmware,
    pending_write: record,
    next: nextStep(state, record),
    version: pkg.version,
    stateDir,
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

export function ejectTarget(status: VDriveStatus): string {
  if (status.observed.state !== "mounted" || status.observed.device === null) {
    throw new CliError("not-mounted", "nothing to eject", {
      next: status.next,
    });
  }

  if (status.pending_write?.phase.kind === "writing") {
    throw new CliError("write-in-progress", "a write cycle is running");
  }

  return status.observed.device;
}
