import { CliError } from "../errors.ts";
import type { BlockDevice, Deps, Observation, Urgency } from "./deps.ts";

export type Notification = {
  headline: string;
  description: string;
  urgency: Urgency;
};

export type FakeDeps = Deps & {
  devices: BlockDevice[];
  nextDevices: BlockDevice[][];
  unmounted: string[];
  notifications: Notification[];
  sleeps: number[];
  lines: string[];
  warnings: string[];
  failUnmount: boolean;
  stopAfterSleeps: number;
};

// A queued device list replaces the current one on each observation.
function observeFake(fake: FakeDeps): Promise<Observation> {
  fake.devices = fake.nextDevices.shift() ?? fake.devices;

  return Promise.resolve({ devices: fake.devices.map((d) => ({ ...d })) });
}

function unmountFake(fake: FakeDeps, device: string): Promise<void> {
  const held = fake.devices.find(
    (d) => d.path === device && d.mountpoint !== null,
  );

  if (fake.failUnmount || held === undefined) {
    return Promise.reject(
      new CliError("eject-failed", `fake udisksctl does not hold ${device}`, {
        device,
      }),
    );
  }

  fake.unmounted.push(device);
  held.mountpoint = null;

  return Promise.resolve();
}

function sleepFake(fake: FakeDeps, ms: number): Promise<void> {
  fake.sleeps.push(ms);

  return fake.sleeps.length >= fake.stopAfterSleeps
    ? Promise.reject(new Error("fake sleep limit reached"))
    : Promise.resolve();
}

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
    nextDevices: [],
    unmounted: [],
    notifications: [],
    sleeps: [],
    lines: [],
    warnings: [],
    failUnmount: false,
    stopAfterSleeps: Number.POSITIVE_INFINITY,
    observe: () => observeFake(fake),
    unmount: (device) => unmountFake(fake, device),
    notify(headline, description, urgency) {
      fake.notifications.push({ headline, description, urgency });

      return Promise.resolve();
    },
    now: () => new Date(Date.UTC(2026, 8, 13, 12, 0, tick++)),
    sleep: (ms) => sleepFake(fake, ms),
    emit: (line) => void fake.lines.push(line),
    warn: (line) => void fake.warnings.push(line),
  };

  return fake;
}
