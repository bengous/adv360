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

// Everything a session decision reads, gathered once by the use case.
export type SessionContext = {
  profile: Profile;
  session: Session | null;
  record: WriteRecord | null;
  disk: Disk | null;
};

// Derived, never stored. An unreadable disk (no v-Drive) keeps the session dirty, not conflict.
export function deriveState(ctx: SessionContext): SessionState {
  const { session, record, disk } = ctx;

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
