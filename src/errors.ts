import type { Json } from "./json.ts";

// The public error names of docs/capabilities.md; errors.test.ts keeps the two in step.
export const ERROR_CODES = [
  "backup-failed",
  "bad-json",
  "bad-profile",
  "corrupt-suspected",
  "diff-failed",
  "eject-failed",
  "file-missing",
  "gui-files-missing",
  "layer-missing",
  "lsblk-failed",
  "lsblk-missing",
  "no-base",
  "no-change",
  "no-session",
  "no-write-record",
  "not-mounted",
  "notification-missing",
  "quickshell-missing",
  "restore-source-missing",
  "session-conflict",
  "udisksctl-missing",
  "write-failed",
  "write-in-progress",
  "write-pending",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class CliError extends Error {
  constructor(
    readonly error: ErrorCode,
    message: string,
    readonly fields: Readonly<Record<string, Json>> = {},
  ) {
    super(message);
  }

  toJSON() {
    return { error: this.error, ...this.fields, message: this.message };
  }
}

export class UsageError extends Error {}

export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
