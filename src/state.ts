import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";

import { decodeObject } from "./decode.ts";
import { isErrno, readText } from "./disk.ts";
import { CliError } from "./errors.ts";
import { parseRecord } from "./record-json.ts";
import { markDied } from "./record.ts";
import type { WriteRecord } from "./record.ts";
import { parseSession } from "./session-json.ts";
import type { Session, SessionContext } from "./session.ts";
import type { Disk, Profile } from "./source.ts";

const RECORD = "write.json";

export function recordPath(stateDir: string): string {
  return join(stateDir, RECORD);
}

function pretty(value: WriteRecord | Session): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function loadRecord(
  stateDir: string,
): Promise<WriteRecord | null> {
  const text = await readText(stateDir, RECORD);

  if (text === null) {
    return null;
  }

  const record = parseRecord(decodeObject(text, RECORD));
  const current = markDied(record);

  if (current !== record) {
    await saveRecord(stateDir, current);
  }

  return current;
}

export async function saveRecord(
  stateDir: string,
  record: WriteRecord,
): Promise<void> {
  await Bun.write(recordPath(stateDir), pretty(record));
}

// The record file is the lock: wx fails when a cycle is already recorded.
export async function createRecord(
  stateDir: string,
  record: WriteRecord,
): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  let fh;

  try {
    fh = await open(recordPath(stateDir), "wx");
  } catch (error) {
    if (isErrno(error) && error.code === "EEXIST") {
      throw new CliError(
        "write-in-progress",
        "another write cycle is recorded; run adv360 vdrive status",
      );
    }

    throw error;
  }

  await fh.writeFile(pretty(record));
  await fh.sync();
  await fh.close();
}

export async function clearRecord(stateDir: string): Promise<void> {
  await rm(recordPath(stateDir), { force: true });
}

function sessionRel(profile: Profile): string {
  return join("sessions", `profile-${profile}.json`);
}

export async function loadSession(
  stateDir: string,
  profile: Profile,
): Promise<Session | null> {
  const rel = sessionRel(profile);
  const text = await readText(stateDir, rel);

  return text === null ? null : parseSession(decodeObject(text, rel));
}

// The file exists iff at least one edit; an empty session is a removed file.
export async function saveSession(
  stateDir: string,
  session: Session,
): Promise<void> {
  const path = join(stateDir, sessionRel(session.profile));

  if (!session.layout && !session.led) {
    await rm(path, { force: true });

    return;
  }

  await mkdir(join(stateDir, "sessions"), { recursive: true });
  await Bun.write(path, pretty(session));
}

export async function loadContext<D extends Disk | null>(
  stateDir: string,
  profile: Profile,
  disk: D,
): Promise<SessionContext & { disk: D }> {
  return {
    profile,
    session: await loadSession(stateDir, profile),
    record: await loadRecord(stateDir),
    disk,
  };
}
