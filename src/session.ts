import { CliError } from "./errors.ts";
import type { WriteRecord } from "./record.ts";
import { KINDS } from "./source.ts";
import type { Disk, FileKind, Profile } from "./source.ts";
import { applyLayoutEdit } from "./txt/layout-edit.ts";
import type { LayoutEdit } from "./txt/layout-edit.ts";
import { parseLayout, serializeLayout } from "./txt/layout.ts";
import { applyLedEdit } from "./txt/led-edit.ts";
import type { LedEdit } from "./txt/led-edit.ts";
import { parseLed, serializeLed } from "./txt/led.ts";

export type Session = {
  profile: Profile;
  layout?: { baseText: string; edits: LayoutEdit[] };
  led?: { baseText: string; edits: LedEdit[] };
};

export type SessionState = "clean" | "dirty" | "conflict" | "applied";

// Derived, never stored. An unreadable disk (no v-Drive) keeps the session dirty, not conflict.
export function deriveState(
  session: Session | null,
  record: WriteRecord | null,
  disk: Disk | null,
): SessionState {
  if (
    record &&
    record.profile === session?.profile &&
    (record.phase.kind === "written" || record.phase.kind === "ejected")
  ) {
    return "applied";
  }

  if (!session) {
    return "clean";
  }

  const conflict = KINDS.some((kind) => {
    const part = session[kind];
    const onDisk = disk?.[kind];

    return (
      part !== undefined &&
      onDisk !== null &&
      onDisk !== undefined &&
      part.baseText !== onDisk
    );
  });

  return conflict ? "conflict" : "dirty";
}

export function render(session: Session, kind: FileKind): string | null {
  switch (kind) {
    case "layout":
      return session.layout
        ? serializeLayout(
            session.layout.edits.reduce(
              applyLayoutEdit,
              parseLayout(session.layout.baseText),
            ),
          )
        : null;
    case "led":
      return session.led
        ? serializeLed(
            session.led.edits.reduce(
              applyLedEdit,
              parseLed(session.led.baseText),
            ),
          )
        : null;
    default:
      return kind satisfies never;
  }
}

export type Edit =
  | { kind: "layout"; edit: LayoutEdit }
  | { kind: "led"; edit: LedEdit };

function base(
  current: string | undefined,
  onDisk: string | null | undefined,
  what: string,
): string {
  if (current !== undefined) {
    return current;
  }

  if (onDisk === null || onDisk === undefined) {
    throw new CliError(
      "no-base",
      `the first edit needs the on-disk ${what}; open the v-Drive or pass --source`,
    );
  }

  return onDisk;
}

// The first edit of a file captures its on-disk base; later edits need no disk.
export function addEdit(
  session: Session | null,
  profile: Profile,
  edit: Edit,
  disk: Disk | null,
): Session {
  const next: Session = session ? structuredClone(session) : { profile };

  switch (edit.kind) {
    case "layout":
      next.layout = {
        baseText: base(next.layout?.baseText, disk?.layout, "layout"),
        edits: [...(next.layout?.edits ?? []), edit.edit],
      };
      break;
    case "led":
      next.led = {
        baseText: base(next.led?.baseText, disk?.led, "led file"),
        edits: [...(next.led?.edits ?? []), edit.edit],
      };
      break;
    default:
      edit satisfies never;
  }

  render(next, "layout");

  return next;
}

export function assertEditable(state: SessionState): void {
  if (state === "conflict") {
    throw new CliError(
      "session-conflict",
      "the file changed on disk since the session started; discard the session",
    );
  }

  if (state === "applied") {
    throw new CliError(
      "write-pending",
      "a write awaits verification; run adv360 verify first",
    );
  }
}
