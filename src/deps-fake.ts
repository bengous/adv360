import type { BlockDevice, Deps, Urgency } from "./deps.ts";
import { CliError } from "./errors.ts";

export type Notification = {
  headline: string;
  description: string;
  urgency: Urgency;
};

export type FakeDeps = Deps & {
  devices: BlockDevice[];
  unmounted: string[];
  notifications: Notification[];
  sleeps: number[];
  lines: string[];
  warnings: string[];
  failUnmount: boolean;
  stopAfterSleeps: number;
};

// The clock ticks one second per call, so two stamps in one run never collide.
export function fakeDeps(
  stateDir: string,
  devices: BlockDevice[] = [],
): FakeDeps {
  let tick = 0;

  const fake: FakeDeps = {
    stateDir,
    sourceEnv: null,
    devices,
    unmounted: [],
    notifications: [],
    sleeps: [],
    lines: [],
    warnings: [],
    failUnmount: false,
    stopAfterSleeps: Number.POSITIVE_INFINITY,
    observe() {
      return Promise.resolve({
        devices: fake.devices.map((d) => ({ ...d })),
      });
    },
    unmount(device) {
      const held = fake.devices.find(
        (d) => d.path === device && d.mountpoint !== null,
      );

      if (fake.failUnmount || held === undefined) {
        return Promise.reject(
          new CliError(
            "eject-failed",
            `fake udisksctl does not hold ${device}`,
            {
              device,
            },
          ),
        );
      }

      fake.unmounted.push(device);
      held.mountpoint = null;

      return Promise.resolve();
    },
    notify(headline, description, urgency) {
      fake.notifications.push({ headline, description, urgency });

      return Promise.resolve();
    },
    now: () => new Date(Date.UTC(2026, 8, 13, 12, 0, tick++)),
    sleep(ms) {
      fake.sleeps.push(ms);

      return fake.sleeps.length >= fake.stopAfterSleeps
        ? Promise.reject(new Error("fake sleep limit reached"))
        : Promise.resolve();
    },
    emit(line) {
      fake.lines.push(line);
    },
    warn(line) {
      fake.warnings.push(line);
    },
  };

  return fake;
}
