import { parseArgs } from "node:util";

import { applyVerb } from "./apply.ts";
import { backup, backupDir } from "./backup.ts";
import { realDeps } from "./deps.ts";
import type { Deps } from "./deps.ts";
import { diffVerb } from "./diff.ts";
import { CliError, UsageError } from "./errors.ts";
import { launchGui } from "./gui.ts";
import { inspect } from "./inspect.ts";
import type { Json } from "./json.ts";
import { restore } from "./restore.ts";
import {
  discardSession,
  editSession,
  loadFileEdit,
  sessionStatus,
} from "./session-edit.ts";
import type { Edit } from "./session.ts";
import { parseProfile } from "./source.ts";
import { loadSession } from "./state.ts";
import {
  eject,
  findSource,
  findSourceOrNull,
  vdriveStatus,
  watch,
} from "./status.ts";
import {
  parseLayerName,
  parseMacroTokens,
  parseTapHoldMs,
} from "./txt/layout.ts";
import { parseLedColors } from "./txt/led-edit.ts";
import { parseIndicator } from "./txt/led.ts";
import { CHORD } from "./vdrive.ts";
import { verify } from "./verify.ts";
import { view } from "./view.ts";

const USAGE = `usage: adv360 <verb> [flags]
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

const OPTIONS = {
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

type Flags = {
  [K in keyof typeof OPTIONS]?: (typeof OPTIONS)[K] extends { multiple: true }
    ? string[]
    : (typeof OPTIONS)[K] extends { type: "boolean" }
      ? boolean
      : string;
};

function need(flags: Flags, name: keyof Flags): string {
  const v = flags[name];

  if (typeof v !== "string" || v === "") {
    throw new UsageError(`--${name} is required`);
  }

  return v;
}

function needLayer(flags: Flags) {
  return parseLayerName(need(flags, "layer"));
}

function sessionEdit(op: string, flags: Flags): Edit {
  switch (op) {
    case "set-remap":
      return {
        kind: "layout",
        edit: {
          op,
          layer: needLayer(flags),
          position: need(flags, "pos"),
          action: need(flags, "action"),
        },
      };
    case "set-taphold":
      return {
        kind: "layout",
        edit: {
          op,
          layer: needLayer(flags),
          position: need(flags, "pos"),
          tap: need(flags, "tap"),
          ms: parseTapHoldMs(need(flags, "ms")),
          hold: need(flags, "hold"),
        },
      };
    case "set-macro":
      return {
        kind: "layout",
        edit: {
          op,
          layer: needLayer(flags),
          trigger: need(flags, "trigger"),
          cotrigger: flags.cotrigger ?? null,
          tokens: parseMacroTokens(need(flags, "tokens")),
        },
      };
    case "remove":
      if (flags.pos !== undefined && flags.pos !== "") {
        return {
          kind: "layout",
          edit: { op: "remove", layer: needLayer(flags), position: flags.pos },
        };
      }

      return {
        kind: "layout",
        edit: {
          op: "remove-macro",
          layer: needLayer(flags),
          trigger: need(flags, "trigger"),
          cotrigger: flags.cotrigger ?? null,
        },
      };
    case "set-led": {
      const func = need(flags, "func").toLowerCase();

      return {
        kind: "led",
        edit: {
          op: "set-led",
          indicator: parseIndicator(need(flags, "indicator")),
          function: func,
          colors: parseLedColors(flags.rgb ?? [], func),
        },
      };
    }

    default:
      throw new UsageError(`unknown session verb: ${op}`);
  }
}

async function sessionVerb(
  deps: Deps,
  flags: Flags,
  op: string,
): Promise<Json> {
  const profile = parseProfile(flags.profile);

  switch (op) {
    case "status":
      return sessionStatus(
        deps,
        profile,
        await findSourceOrNull(deps, flags.source),
      );
    case "discard":
      return discardSession(
        deps,
        profile,
        await findSourceOrNull(deps, flags.source),
      );
    case "load-file": {
      const edit = await loadFileEdit(need(flags, "from"), flags.kind);

      return editSession(
        deps,
        profile,
        await findSourceOrNull(deps, flags.source),
        edit,
      );
    }

    default: {
      const edit = sessionEdit(op, flags);

      return editSession(
        deps,
        profile,
        await findSourceOrNull(deps, flags.source),
        edit,
      );
    }
  }
}

type Handler = (flags: Flags, positionals: string[]) => Promise<Json>;

function handlers(deps: Deps): Record<string, Handler> {
  return {
    "vdrive status": () => vdriveStatus(deps),
    "vdrive eject": () => eject(deps),
    gui: () => launchGui(),
    watch: () => watch(deps),
    inspect: async (flags) =>
      inspect(
        (await findSource(deps, flags.source)).dir,
        flags.profile === undefined ? undefined : parseProfile(flags.profile),
      ),
    view: async (flags) => {
      const profile = parseProfile(flags.profile);
      const source = await findSource(deps, flags.source);

      return view(
        source.dir,
        profile,
        needLayer(flags),
        await loadSession(deps.stateDir, profile),
      );
    },
    session: (flags, positionals) =>
      sessionVerb(deps, flags, positionals[1] ?? ""),
    diff: async (flags) =>
      diffVerb(
        deps,
        parseProfile(flags.profile),
        await findSourceOrNull(deps, flags.source),
      ),
    apply: async (flags) =>
      applyVerb(
        deps,
        parseProfile(flags.profile),
        await findSource(deps, flags.source),
        flags["dry-run"] === true,
      ),
    verify: async (flags) => verify(deps, await findSource(deps, flags.source)),
    backup: async (flags) =>
      backup(
        (await findSource(deps, flags.source)).dir,
        backupDir(deps.stateDir, deps.now()),
      ),
    restore: async (flags, positionals) => {
      const from = positionals[1];

      if (from === undefined || from === "") {
        throw new UsageError("restore needs a backup dir or a .txt file");
      }

      const profile = parseProfile(flags.profile);

      return restore(deps, await findSource(deps, flags.source), profile, from);
    },
  };
}

export async function run(
  argv: string[],
  deps: Deps = realDeps(),
): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: OPTIONS,
    });

    const table = handlers(deps);

    const handler =
      table[positionals.slice(0, 2).join(" ")] ?? table[positionals[0] ?? ""];

    if (!handler) {
      throw new UsageError(
        `unknown verb: ${positionals.join(" ") || "(none)"}`,
      );
    }

    deps.emit(JSON.stringify(await handler(values, positionals)));

    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      deps.emit(JSON.stringify(error));

      return 1;
    }

    if (
      error instanceof UsageError ||
      (error instanceof TypeError &&
        /^(Unknown option|Option)/.test(error.message))
    ) {
      deps.warn(`adv360: ${error.message}\n${USAGE}`);

      return 2;
    }

    throw error;
  }
}

export { CHORD };

if (import.meta.main) {
  process.exit(await run(Bun.argv.slice(2)));
}
