import type { Json } from "./json.ts";

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
