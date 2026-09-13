import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { CliError } from "./errors.ts";

export const PROFILES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type Profile = (typeof PROFILES)[number];

function isProfile(n: number): n is Profile {
  return PROFILES.some((p) => p === n);
}

export function parseProfile(value: string | undefined): Profile {
  const n = Number(value);

  if (!isProfile(n)) {
    throw new CliError(
      "bad-profile",
      `--profile must be 1..9, got ${value ?? "nothing"}`,
    );
  }

  return n;
}

export type FileKind = "layout" | "led";

export const KINDS = ["layout", "led"] as const satisfies readonly FileKind[];

export function relOf(kind: FileKind, profile: Profile): string {
  return kind === "layout"
    ? `layouts/layout${profile}.txt`
    : `lighting/led${profile}.txt`;
}

export function kindOfName(path: string): FileKind {
  return basename(path).startsWith("led") ? "led" : "layout";
}

export const SETTINGS_REL = "settings/settings.txt";

// --source DIR stands for a mounted volume with no device: nothing to eject, by type.
export type Source = { dir: string; device: string | null };

export type Disk = Record<FileKind, string | null>;

export async function readText(
  dir: string,
  rel: string,
): Promise<string | null> {
  const file = Bun.file(join(dir, rel));

  return (await file.exists()) ? file.text() : null;
}

export async function readDisk(dir: string, profile: Profile): Promise<Disk> {
  return {
    layout: await readText(dir, relOf("layout", profile)),
    led: await readText(dir, relOf("led", profile)),
  };
}

const PROFILE_FILE = /^(layout|led)[1-9]\.txt$/;

export async function listNamedBackups(dir: string): Promise<string[]> {
  const out: string[] = [];

  for (const sub of ["layouts", "lighting"]) {
    const names = await readdir(join(dir, sub)).catch((): string[] => []);

    for (const name of names.toSorted()) {
      if (!PROFILE_FILE.test(name)) {
        out.push(`${sub}/${name}`);
      }
    }
  }

  return out;
}
