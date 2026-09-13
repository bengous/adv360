import { CliError } from "./errors.ts";
import { isJsonObject } from "./json.ts";
import type { Is, Json, JsonObject } from "./json.ts";

export function badJson(what: string, detail: string): CliError {
  return new CliError("bad-json", `${what}: ${detail}`, { what });
}

// The one place a JSON text becomes typed data: state files and lsblk output.
export function decodeObject(text: string, what: string): JsonObject {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (error) {
    throw badJson(what, error instanceof Error ? error.message : String(error));
  }

  if (!isJsonObject(value)) {
    throw badJson(what, "not a JSON object");
  }

  return value;
}

export function field<T extends Json>(
  object: JsonObject,
  key: string,
  is: Is<T>,
  what: string,
): T {
  const value = object[key];

  if (!is(value)) {
    throw badJson(
      what,
      `${key} is ${value === undefined ? "missing" : JSON.stringify(value)}`,
    );
  }

  return value;
}
