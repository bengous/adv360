export class CliError extends Error {
  constructor(
    readonly error: string,
    message: string,
    readonly fields: Record<string, unknown> = {},
  ) {
    super(message);
  }

  toJSON(): Record<string, unknown> {
    return { error: this.error, ...this.fields, message: this.message };
  }
}

export class UsageError extends Error {}
