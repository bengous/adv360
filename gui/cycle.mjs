// @ts-check
// Where the write cycle stands, from `vdrive status` and `session status`, and backup names.

/**
 * @typedef {"SmartSet + Hotkey 3" | "SmartSet + Hotkey 4"} Chord
 * @typedef {{ kind: "open", chord: Chord }
 *   | { kind: "edit", pending: number }
 *   | { kind: "write" }
 *   | { kind: "reload", chord: Chord, next: Chord }
 *   | { kind: "verify" }
 *   | { kind: "broken", backup: string }} CycleStep
 * @typedef {{ state: string, observed: { state: string },
 *   pending_write: { backup_dir: string, phase: { kind: string } } | null }} VDriveStatus
 * @typedef {{ layout: { edits: readonly unknown[] } | null, led: { edits: readonly unknown[] } | null }} SessionStatus
 */

/** @type {Chord} */
const OPEN = "SmartSet + Hotkey 3";

/** @type {Chord} */
const RELOAD = "SmartSet + Hotkey 4";

/**
 * @param {SessionStatus | null} session
 */
function pendingOf(session) {
  return (
    (session?.layout?.edits.length ?? 0) + (session?.led?.edits.length ?? 0)
  );
}

/**
 * @param {VDriveStatus | null} status
 * @param {SessionStatus | null} session
 * @returns {CycleStep}
 */
export function cycleStep(status, session) {
  if (status === null) {
    return { kind: "open", chord: OPEN };
  }

  if (status.state === "corrupt-suspected") {
    return { kind: "broken", backup: status.pending_write?.backup_dir ?? "" };
  }

  if (status.state === "busy-writing") {
    return { kind: "write" };
  }

  if (status.pending_write?.phase.kind === "ejected") {
    return status.observed.state === "mounted"
      ? { kind: "verify" }
      : { kind: "reload", chord: RELOAD, next: OPEN };
  }

  return status.state === "mounted"
    ? { kind: "edit", pending: pendingOf(session) }
    : { kind: "open", chord: OPEN };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * @param {number} n
 */
function two(n) {
  return String(n).padStart(2, "0");
}

/**
 * A backup folder (UTC, as `backup` names it) in local time: "today 15:47", "13 Sep 21:21",
 * with the year when it is not this one; a name that is no timestamp comes back as it is.
 * @param {string} dirName
 * @param {Date} now
 */
export function backupLabel(dirName, now) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(dirName);

  if (m === null) {
    return dirName;
  }

  const [, y, mo, d, h, mi, s] = m.map(Number);

  const at = new Date(
    Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0),
  );

  const time = `${two(at.getHours())}:${two(at.getMinutes())}`;

  if (at.toDateString() === now.toDateString()) {
    return `today ${time}`;
  }

  const year =
    at.getFullYear() === now.getFullYear() ? "" : ` ${at.getFullYear()}`;

  return `${at.getDate()} ${MONTHS[at.getMonth()]}${year} ${time}`;
}
