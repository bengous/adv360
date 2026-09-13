import { basename } from "node:path";

import { field } from "./decode.ts";
import { CliError } from "./errors.ts";
import { isString, orNull } from "./json.ts";
import type { JsonObject } from "./json.ts";

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

export function parseSource(object: JsonObject, what: string): Source {
  return {
    dir: field(object, "dir", isString, what),
    device: field(object, "device", orNull(isString), what),
  };
}

export type Disk = Record<FileKind, string | null>;
