import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { CliError } from "./errors.ts";
import { layoutRel, ledRel, readText, type Profile } from "./source.ts";
import { applyLayoutEdit, LayerMissing, parseLayout, serializeLayout, type LayoutEdit } from "./txt/layout.ts";
import { applyLedEdit, parseLed, serializeLed, type LedEdit } from "./txt/led.ts";
import type { WriteRecord } from "./write.ts";

export type Session = {
  profile: Profile;
  layout?: { baseText: string; edits: LayoutEdit[] };
  led?: { baseText: string; edits: LedEdit[] };
};

export type SessionState = "clean" | "dirty" | "conflict" | "applied";

export function sessionPath(stateDir: string, profile: Profile): string {
  return join(stateDir, "sessions", `profile-${profile}.json`);
}

export async function loadSession(stateDir: string, profile: Profile): Promise<Session | null> {
  const file = Bun.file(sessionPath(stateDir, profile));
  return (await file.exists()) ? ((await file.json()) as Session) : null;
}

// The file exists iff at least one edit; an empty session is a removed file.
export async function saveSession(stateDir: string, session: Session): Promise<void> {
  const path = sessionPath(stateDir, session.profile);
  if (!session.layout && !session.led) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(join(stateDir, "sessions"), { recursive: true });
  await Bun.write(path, JSON.stringify(session, null, 2) + "\n");
}

export type Disk = { layout: string | null; led: string | null };

export async function readDisk(dir: string, profile: Profile): Promise<Disk> {
  return { layout: await readText(dir, layoutRel(profile)), led: await readText(dir, ledRel(profile)) };
}

// Derived, never stored. An unreadable disk (no v-Drive) keeps the session dirty, not conflict.
export function deriveState(session: Session | null, record: WriteRecord | null, disk: Disk | null): SessionState {
  if (record && record.profile === session?.profile && (record.phase.kind === "written" || record.phase.kind === "ejected")) {
    return "applied";
  }
  if (!session) return "clean";
  if (disk) {
    if (session.layout && disk.layout !== null && session.layout.baseText !== disk.layout) return "conflict";
    if (session.led && disk.led !== null && session.led.baseText !== disk.led) return "conflict";
  }
  return "dirty";
}

export function renderLayout(session: Session): string | null {
  if (!session.layout) return null;
  try {
    return serializeLayout(session.layout.edits.reduce(applyLayoutEdit, parseLayout(session.layout.baseText)));
  } catch (e) {
    if (e instanceof LayerMissing) throw new CliError("layer-missing", e.message, { layer: e.layer });
    throw e;
  }
}

export function renderLed(session: Session): string | null {
  if (!session.led) return null;
  return serializeLed(session.led.edits.reduce(applyLedEdit, parseLed(session.led.baseText)));
}

export type Edit = { kind: "layout"; edit: LayoutEdit } | { kind: "led"; edit: LedEdit };

// The first edit of a file captures its on-disk base; later edits need no disk.
export function addEdit(session: Session | null, profile: Profile, edit: Edit, disk: Disk | null): Session {
  const next: Session = session ? structuredClone(session) : { profile };
  const base = (current: string | undefined, onDisk: string | null | undefined, what: string): string => {
    if (current !== undefined) return current;
    if (onDisk === null || onDisk === undefined) {
      throw new CliError("no-base", `the first edit needs the on-disk ${what}; open the v-Drive or pass --source`);
    }
    return onDisk;
  };
  switch (edit.kind) {
    case "layout":
      next.layout = { baseText: base(next.layout?.baseText, disk?.layout, "layout"), edits: [...(next.layout?.edits ?? []), edit.edit] };
      break;
    case "led":
      next.led = { baseText: base(next.led?.baseText, disk?.led, "led file"), edits: [...(next.led?.edits ?? []), edit.edit] };
      break;
    default:
      edit satisfies never;
  }
  renderLayout(next);
  return next;
}

export function assertEditable(state: SessionState): void {
  if (state === "conflict") throw new CliError("session-conflict", "the file changed on disk since the session started; discard the session");
  if (state === "applied") throw new CliError("write-pending", "a write awaits verification; run adv360 verify first");
}
