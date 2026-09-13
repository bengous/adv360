import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CliError } from "../errors.ts";
import { listDir, syncDir, writeSynced } from "./disk.ts";

export const BACKUP_SUBDIRS = ["layouts", "lighting", "settings"] as const;

export function backupDir(stateDir: string, now: Date): string {
  const stamp = now.toISOString().replaceAll(/[-:]|\.\d{3}/g, "");

  return join(stateDir, "backups", stamp);
}

export type BackupReport = { backup_dir: string; files: string[] };

export async function backup(
  sourceDir: string,
  dir: string,
): Promise<BackupReport> {
  const files: string[] = [];

  for (const sub of BACKUP_SUBDIRS) {
    const names = await listDir(join(sourceDir, sub));

    if (names.length === 0) {
      continue;
    }

    await mkdir(join(dir, sub), { recursive: true });

    for (const name of names) {
      const file = Bun.file(join(sourceDir, sub, name));

      if (file.size === 0 && !(await file.exists())) {
        continue;
      }

      await writeSynced(join(dir, sub, name), await file.text());
      files.push(`${sub}/${name}`);
    }

    await syncDir(join(dir, sub));
  }

  if (files.length === 0) {
    throw new CliError(
      "backup-failed",
      `nothing to back up under ${sourceDir}`,
    );
  }

  return { backup_dir: dir, files };
}
