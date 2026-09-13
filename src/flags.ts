import { parseArgs } from "node:util";

import { UsageError } from "./errors.ts";

export const USAGE = `usage: adv360 <verb> [flags]
  vdrive status                       composed v-Drive state, active profile, next chord
  vdrive eject                        udisksctl unmount, then the human closes the v-Drive
  watch                               JSON line per change, notification on mount
  inspect [--profile N]               raw entries of every profile
  view --profile N --layer L          effective action per key (L: base kp fn1 fn2 fn3)
  session set-remap   --profile N --layer L --pos P --action A
  session set-taphold --profile N --layer L --pos P --tap A --ms MS --hold B
  session set-macro   --profile N --layer L --trigger P [--cotrigger M] --tokens "{a}{b}"
  session remove      --profile N --layer L (--pos P | --trigger P [--cotrigger M])
  session set-led     --profile N --indicator INDn --func F --rgb R,G,B | --rgb layd=R,G,B ...
  session load-file   --profile N --from PATH [--kind layout|led]
  session discard | status --profile N
  diff --profile N                    unified diff, CRLF preserved
  apply --profile N [--dry-run]       backup, atomic write, read back, eject
  verify                              compare the reopened v-Drive with the write record
  backup                              copy layouts/ lighting/ settings/ to the state dir
  restore <dir-or-file> --profile N   open a replace-file session from a backup
  gui                                 launch the Quickshell editor
Every verb accepts --source DIR instead of the mounted v-Drive.`;

export const OPTIONS = {
  source: { type: "string" },
  profile: { type: "string" },
  layer: { type: "string" },
  pos: { type: "string" },
  action: { type: "string" },
  tap: { type: "string" },
  ms: { type: "string" },
  hold: { type: "string" },
  trigger: { type: "string" },
  cotrigger: { type: "string" },
  tokens: { type: "string" },
  indicator: { type: "string" },
  func: { type: "string" },
  rgb: { type: "string", multiple: true },
  from: { type: "string" },
  kind: { type: "string" },
  "dry-run": { type: "boolean" },
} as const;

export type Flags = {
  [K in keyof typeof OPTIONS]?: (typeof OPTIONS)[K] extends { multiple: true }
    ? string[]
    : (typeof OPTIONS)[K] extends { type: "boolean" }
      ? boolean
      : string;
};

type StringFlag = {
  [K in keyof Flags]-?: Flags[K] extends string | undefined ? K : never;
}[keyof Flags];

export type ParsedArgs = { flags: Flags; positionals: string[] };

// parseArgs rejects an unknown option with a TypeError; run() turns it into usage.
export function parseFlags(argv: string[]): ParsedArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: OPTIONS,
  });

  return { flags: values, positionals };
}

export function need(flags: Flags, name: StringFlag): string {
  const value = flags[name];

  if (value === undefined || value === "") {
    throw new UsageError(`--${name} is required`);
  }

  return value;
}
