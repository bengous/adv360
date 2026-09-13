import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

import { KINDS, relOf } from "../model/source.ts";
import type { Disk, Profile } from "../model/source.ts";

export function isErrno(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error && "code" in error && typeof error.code === "string"
  );
}

export async function readText(
  dir: string,
  rel: string,
): Promise<string | null> {
  const file = Bun.file(join(dir, rel));

  return (await file.exists()) ? file.text() : null;
}

export async function readDisk(dir: string, profile: Profile): Promise<Disk> {
  const disk: Disk = { layout: null, led: null };

  for (const kind of KINDS) {
    disk[kind] = await readText(dir, relOf(kind, profile));
  }

  return disk;
}

export async function writeSynced(
  path: string,
  content: string,
): Promise<void> {
  const fh = await open(path, "w");

  try {
    await fh.writeFile(content);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

export async function syncDir(path: string): Promise<void> {
  const fh = await open(path, "r");

  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
}

// A missing directory lists as empty; any other failure propagates.
export async function listDir(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).toSorted();
  } catch (error) {
    if (isErrno(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

const PROFILE_FILE = /^(layout|led)[1-9]\.txt$/;

export async function listNamedBackups(dir: string): Promise<string[]> {
  const out: string[] = [];

  for (const sub of ["layouts", "lighting"]) {
    for (const name of await listDir(join(dir, sub))) {
      if (!PROFILE_FILE.test(name)) {
        out.push(`${sub}/${name}`);
      }
    }
  }

  return out;
}
