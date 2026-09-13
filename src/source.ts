import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CliError } from "./errors.ts";

export const PROFILES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Profile = (typeof PROFILES)[number];

export function layoutRel(profile: Profile): string {
  return `layouts/layout${profile}.txt`;
}

export function ledRel(profile: Profile): string {
  return `lighting/led${profile}.txt`;
}

export const SETTINGS_REL = "settings/settings.txt";

export function parseProfile(value: string | undefined): Profile {
  const n = Number(value);
  if (!PROFILES.includes(n as Profile)) {
    throw new CliError("bad-profile", `--profile must be 1..9, got ${value ?? "nothing"}`);
  }
  return n as Profile;
}

export async function readText(dir: string, rel: string): Promise<string | null> {
  const file = Bun.file(join(dir, rel));
  return (await file.exists()) ? file.text() : null;
}

const PROFILE_FILE = /^(layout|led)[1-9]\.txt$/;

export async function listNamedBackups(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const sub of ["layouts", "lighting"]) {
    const names = await readdir(join(dir, sub)).catch(() => []);
    for (const name of names.sort()) if (!PROFILE_FILE.test(name)) out.push(`${sub}/${name}`);
  }
  return out;
}
