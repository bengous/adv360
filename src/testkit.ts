import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decodeObject, field } from "./decode.ts";
import { fakeDeps } from "./deps-fake.ts";
import type { FakeDeps } from "./deps-fake.ts";
import { isString } from "./json.ts";
import type { JsonObject } from "./json.ts";
import { run } from "./main.ts";
import type { WriteRecord } from "./record.ts";
import type { Profile } from "./source.ts";

export const FIXTURES = join(import.meta.dir, "../tests/fixtures/real");

export const DEVICE = "/dev/fake";

export type Fixture = { root: string; mount: string; deps: FakeDeps };

// A copy of the keyboard's files under a tempdir, mounted on a fake device.
export async function mountFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "adv360-"));
  const mount = join(root, "ADV360");
  await cp(FIXTURES, mount, { recursive: true });

  const deps = fakeDeps(join(root, "state"), [
    { path: DEVICE, label: "ADV360", mountpoint: mount },
  ]);

  return { root, mount, deps };
}

export function remount(fx: Fixture): void {
  for (const device of fx.deps.devices) {
    device.mountpoint = fx.mount;
  }
}

export type Reply = { code: number; last: JsonObject; lines: JsonObject[] };

export async function adv(deps: FakeDeps, ...argv: string[]): Promise<Reply> {
  const before = deps.lines.length;
  const code = await run(argv, deps);
  const lines = deps.lines.slice(before).map((l) => decodeObject(l, "reply"));

  return { code, last: lines.at(-1) ?? {}, lines };
}

export type RemapSpec = {
  profile: Profile;
  layer: string;
  pos: string;
  action: string;
  source?: string;
};

export function setRemap(deps: FakeDeps, spec: RemapSpec): Promise<Reply> {
  const source = spec.source === undefined ? [] : ["--source", spec.source];

  return adv(
    deps,
    "session",
    "set-remap",
    "--profile",
    String(spec.profile),
    "--layer",
    spec.layer,
    "--pos",
    spec.pos,
    "--action",
    spec.action,
    ...source,
  );
}

export type LedSpec = {
  profile: Profile;
  indicator: string;
  func: string;
  rgb: string[];
};

export function setLed(deps: FakeDeps, spec: LedSpec): Promise<Reply> {
  return adv(
    deps,
    "session",
    "set-led",
    "--profile",
    String(spec.profile),
    "--indicator",
    spec.indicator,
    "--func",
    spec.func,
    ...spec.rgb.flatMap((rgb) => ["--rgb", rgb]),
  );
}

export function str(object: JsonObject, key: string): string {
  return field(object, key, isString, "reply");
}

// bun-types declare the rejects matchers as void: the rejection is captured by hand.
export async function rejection<T>(promise: Promise<T>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }

  throw new Error("expected a rejection");
}

export function textAt(dir: string, rel: string): Promise<string> {
  return Bun.file(join(dir, rel)).text();
}

export function recordOf(
  profile: Profile,
  phase: WriteRecord["phase"],
  source = "",
): WriteRecord {
  return {
    profile,
    started_at: "",
    backup_dir: "",
    source: { dir: source, device: null },
    files: [],
    phase,
  };
}
