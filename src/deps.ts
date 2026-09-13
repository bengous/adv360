import { homedir } from "node:os";
import { join } from "node:path";

import { CliError } from "./errors.ts";

export type BlockDevice = {
  path: string;
  label: string | null;
  mountpoint: string | null;
};

export type Observation = { devices: BlockDevice[] };

export type Urgency = "low" | "normal" | "critical";

export type Deps = {
  stateDir: string;
  observe(): Promise<Observation>;
  unmount(device: string): Promise<void>;
  notify(
    headline: string,
    description: string,
    urgency: Urgency,
  ): Promise<void>;
  now(): Date;
};

const SPAWN_TIMEOUT_MS = 10_000;

async function runCommand(
  argv: string[],
  missing: string,
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
        `${argv[0]} is not installed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })();

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { code: await proc.exited, stdout, stderr };
}

export function defaultStateDir(): string {
  return join(
    process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state"),
    "adv360",
  );
}

export function realDeps(): Deps {
  return {
    stateDir: defaultStateDir(),
    async observe() {
      const r = await runCommand(
        ["lsblk", "-J", "-o", "PATH,LABEL,MOUNTPOINT"],
        "lsblk-missing",
      );

      if (r.code !== 0) {
        throw new CliError("lsblk-failed", r.stderr.trim());
      }

      const parsed = JSON.parse(r.stdout) as { blockdevices: BlockDevice[] };

      return { devices: parsed.blockdevices };
    },
    async unmount(device) {
      const r = await runCommand(
        ["udisksctl", "unmount", "-b", device],
        "udisksctl-missing",
      );

      if (r.code !== 0) {
        throw new CliError("eject-failed", r.stderr.trim() || r.stdout.trim(), {
          device,
        });
      }
    },
    async notify(headline, description, urgency) {
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
        console.error(
          `adv360: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    now: () => new Date(),
  };
}

export type FakeDeps = Deps & {
  devices: BlockDevice[];
  unmounted: string[];
  notifications: { headline: string; description: string; urgency: Urgency }[];
  failUnmount: boolean;
};

export function fakeDeps(
  stateDir: string,
  devices: BlockDevice[] = [],
): FakeDeps {
  const fake: FakeDeps = {
    stateDir,
    devices,
    unmounted: [],
    notifications: [],
    failUnmount: false,
    async observe() {
      return { devices: fake.devices.map((d) => ({ ...d })) };
    },
    async unmount(device) {
      if (fake.failUnmount) {
        throw new CliError("eject-failed", "fake udisksctl refused", {
          device,
        });
      }

      fake.unmounted.push(device);

      for (const d of fake.devices) {
        if (d.path === device) {
          d.mountpoint = null;
        }
      }
    },
    async notify(headline, description, urgency) {
      fake.notifications.push({ headline, description, urgency });
    },
    now: () => new Date("2026-09-13T12:00:00Z"),
  };

  return fake;
}
