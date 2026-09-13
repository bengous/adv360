export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | JsonObject;

export type JsonObject = { readonly [key: string]: Json };

export type Is<T extends Json> = (value: Json | undefined) => value is T;
