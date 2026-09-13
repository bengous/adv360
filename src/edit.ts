import { CliError } from "./errors.ts";
import { deriveState, render } from "./session.ts";
import type { Session, SessionContext, SessionState } from "./session.ts";
import { relOf } from "./source.ts";
import type { Profile, Source } from "./source.ts";
import type { LayoutEdit } from "./txt/layout-edit.ts";
import type { LedEdit } from "./txt/led-edit.ts";

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

type Part<E> = { baseText: string; edits: E[] };

// The first edit of a file captures its on-disk base; later edits need no disk.
function partWith<E>(
  part: Part<E> | undefined,
  onDisk: string | null | undefined,
  edit: E,
  what: string,
): Part<E> {
  return {
    baseText: base(part?.baseText, onDisk, what),
    edits: [...(part?.edits ?? []), edit],
  };
}

function addEdit(ctx: SessionContext, edit: Edit): Session {
  const { session, profile, disk } = ctx;
  const next: Session = session ? structuredClone(session) : { profile };

  switch (edit.kind) {
    case "layout":
      next.layout = partWith(next.layout, disk?.layout, edit.edit, "layout");
      break;
    case "led":
      next.led = partWith(next.led, disk?.led, edit.edit, "led file");
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

export function decideEdit(ctx: SessionContext, edit: Edit): Session {
  assertEditable(deriveState(ctx));

  return addEdit(ctx, edit);
}

export type SessionStatus = {
  profile: Profile;
  state: SessionState;
  source: Source | null;
  layout: { edits: LayoutEdit[]; renders: string } | null;
  led: { edits: LedEdit[]; renders: string } | null;
};

export function sessionStatusOf(
  ctx: SessionContext,
  source: Source | null,
): SessionStatus {
  const { profile, session } = ctx;

  return {
    profile,
    state: deriveState(ctx),
    source,
    layout: session?.layout
      ? { edits: session.layout.edits, renders: relOf("layout", profile) }
      : null,
    led: session?.led
      ? { edits: session.led.edits, renders: relOf("led", profile) }
      : null,
  };
}
