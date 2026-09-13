import { homedir } from "node:os";
import { join } from "node:path";

import { CliError, messageOf } from "../errors.ts";
import type { ErrorCode } from "../errors.ts";
import type { BlockDevice, Observation } from "../model/vdrive.ts";
import { decodeObject, field } from "./decode.ts";
import { isArray, isObject, isString, orNull } from "./json.ts";
import type { Json } from "./json.ts";

export type { BlockDevice, Observation } from "../model/vdrive.ts";

export type Urgency = "low" | "normal" | "critical";

// The ports: everything the use cases need from the machine, faked in deps-fake.ts.
export type Deps = {
  stateDir: string;
  sourceEnv: string | null;
  observe(): Promise<Observation>;
  unmount(device: string): Promise<void>;
  notify(
    headline: string,
    description: string,
    urgency: Urgency,
  ): Promise<void>;
  now(): Date;
  sleep(ms: number): Promise<void>;
  emit(line: string): void;
  warn(line: string): void;
};

const SPAWN_TIMEOUT_MS = 10_000;

async function runCommand(
  argv: string[],
  missing: ErrorCode,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = (() => {
    try {
      return Bun.spawn(argv, {
        stdout: "pipe",
        stderr: "pipe",
        timeout: SPAWN_TIMEOUT_MS,
      });
    } catch (error) {
      throw new CliError(
        missing,
        `${argv[0]} is not installed: ${messageOf(error)}`,
      );
    }
  })();

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { code: await proc.exited, stdout, stderr };
}

function parseBlockDevice(value: Json): BlockDevice {
  if (!isObject(value)) {
    throw new CliError("lsblk-failed", "blockdevices holds a non-object");
  }

  return {
    path: field(value, "path", isString, "lsblk"),
    label: field(value, "label", orNull(isString), "lsblk"),
    mountpoint: field(value, "mountpoint", orNull(isString), "lsblk"),
  };
}

export function defaultStateDir(): string {
  return join(
    process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state"),
    "adv360",
  );
}

async function observe(): Promise<Observation> {
  const r = await runCommand(
    ["lsblk", "-J", "-o", "PATH,LABEL,MOUNTPOINT"],
    "lsblk-missing",
  );

  if (r.code !== 0) {
    throw new CliError("lsblk-failed", r.stderr.trim());
  }

  const devices = field(
    decodeObject(r.stdout, "lsblk"),
    "blockdevices",
    isArray,
    "lsblk",
  );

  return { devices: devices.map(parseBlockDevice) };
}

async function unmount(device: string): Promise<void> {
  const r = await runCommand(
    ["udisksctl", "unmount", "-b", device],
    "udisksctl-missing",
  );

  if (r.code !== 0) {
    throw new CliError("eject-failed", r.stderr.trim() || r.stdout.trim(), {
      device,
    });
  }
}

function warn(line: string): void {
  console.error(line);
}

async function notify(
  headline: string,
  description: string,
  urgency: Urgency,
): Promise<void> {
  try {
    await runCommand(
      [
        "omarchy-notification-send",
        "--app-name",
        "adv360",
        "-u",
        urgency,
        headline,
        description,
      ],
      "notification-missing",
    );
  } catch (error) {
    // A missing notifier must never fail a write cycle.
    warn(`adv360: ${messageOf(error)}`);
  }
}

export function realDeps(): Deps {
  return {
    stateDir: defaultStateDir(),
    sourceEnv: process.env["ADV360_SOURCE"] ?? null,
    observe,
    unmount,
    notify,
    now: () => new Date(),
    sleep: (ms) => Bun.sleep(ms),
    emit: (line) => console.log(line),
    warn,
  };
}
