import type { Json } from "./io/json.ts";

export class CliError extends Error {
  constructor(
    readonly error: string,
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
