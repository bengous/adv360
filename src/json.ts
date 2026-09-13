export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | JsonObject;

export type JsonObject = { readonly [key: string]: Json };

export type Is<T extends Json> = (value: Json | undefined) => value is T;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: Json | undefined): value is string {
  return typeof value === "string";
}

export function isNumber(value: Json | undefined): value is number {
  return typeof value === "number";
}

export function isArray(value: Json | undefined): value is readonly Json[] {
  return Array.isArray(value);
}

export function orNull<T extends Json>(is: Is<T>): Is<T | null> {
  return (value): value is T | null => value === null || is(value);
}
