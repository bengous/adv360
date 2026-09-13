import { parseArgs } from "node:util";

import { realDeps } from "./deps.ts";
import type { Deps } from "./deps.ts";
import { CliError, UsageError } from "./errors.ts";
import { launchGui } from "./gui.ts";
import { inspect } from "./inspect.ts";
import {
  addEdit,
  assertEditable,
  deriveState,
  loadSession,
  readDisk,
  renderLayout,
  renderLed,
  saveSession,
} from "./session.ts";
import type { Disk, Edit, Session } from "./session.ts";
import { layoutRel, ledRel, parseProfile } from "./source.ts";
import type { Profile } from "./source.ts";
import { layerFromName } from "./txt/layout.ts";
import type { LayerName } from "./txt/layout.ts";
import { INDICATORS } from "./txt/led.ts";
import type { Indicator, Rgb } from "./txt/led.ts";
import { CHORD, resolveSource, vdriveStatus, watch } from "./vdrive.ts";
import type { Source } from "./vdrive.ts";
import { view } from "./view.ts";
import {
  backup,
  describePlan,
  diffFiles,
  ejectAfterWrite,
  executeApply,
  loadRecord,
  planApply,
  restoreSession,
  verify,
} from "./write.ts";

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

function needLayer(flags: Flags): LayerName {
  const layer = layerFromName(need(flags, "layer"));

  if (!layer) {
    throw new UsageError("--layer must be one of base kp fn1 fn2 fn3");
  }

  return layer;
}

function parseTokens(text: string): string[] {
  const braced = [...text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!);

  const tokens =
    braced.length > 0 ? braced : text.split(/[\s,]+/).filter(Boolean);

  if (tokens.length === 0) {
    throw new UsageError("--tokens needs at least one token");
  }

  return tokens;
}

function parseRgb(text: string): Rgb {
  const parts = text.split(",").map(Number);

  if (
    parts.length !== 3 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    throw new UsageError(`--rgb expects R,G,B in 0..255, got ${text}`);
  }

  return parts as Rgb;
}

function parseIndicator(text: string): Indicator {
  const upper = text.toUpperCase() as Indicator;

  if (!INDICATORS.includes(upper)) {
    throw new UsageError("--indicator must be IND1..IND6");
  }

  return upper;
}

async function sourceOrNull(deps: Deps, flags: Flags): Promise<Source | null> {
  try {
    return await resolveSource(deps, flags.source);
  } catch (error) {
    if (error instanceof CliError && error.error === "not-mounted") {
      return null;
    }

    throw error;
  }
}

type SessionStatus = {
  profile: Profile;
  state: string;
  source: Source | null;
  layout: { edits: unknown[]; renders: string } | null;
  led: { edits: unknown[]; renders: string } | null;
};

async function sessionStatus(
  deps: Deps,
  profile: Profile,
  source: Source | null,
): Promise<SessionStatus> {
  const session = await loadSession(deps.stateDir, profile);
  const disk = source ? await readDisk(source.dir, profile) : null;
  const state = deriveState(session, await loadRecord(deps.stateDir), disk);

  return {
    profile,
    state,
    source,
    layout: session?.layout
      ? { edits: session.layout.edits, renders: layoutRel(profile) }
      : null,
    led: session?.led
      ? { edits: session.led.edits, renders: ledRel(profile) }
      : null,
  };
}

async function editSession(
  deps: Deps,
  flags: Flags,
  profile: Profile,
  edit: Edit,
): Promise<SessionStatus> {
  const source = await sourceOrNull(deps, flags);
  const disk: Disk | null = source ? await readDisk(source.dir, profile) : null;
  const session = await loadSession(deps.stateDir, profile);
  assertEditable(deriveState(session, await loadRecord(deps.stateDir), disk));
  await saveSession(deps.stateDir, addEdit(session, profile, edit, disk));

  return sessionStatus(deps, profile, source);
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
    case "set-taphold": {
      const ms = Number(need(flags, "ms"));

      if (!Number.isInteger(ms) || ms < 1 || ms > 999) {
        throw new UsageError("--ms must be 1..999");
      }

      return {
        kind: "layout",
        edit: {
          op,
          layer: needLayer(flags),
          position: need(flags, "pos"),
          tap: need(flags, "tap"),
          ms,
          hold: need(flags, "hold"),
        },
      };
    }

    case "set-macro":
      return {
        kind: "layout",
        edit: {
          op,
          layer: needLayer(flags),
          trigger: need(flags, "trigger"),
          cotrigger: flags.cotrigger ?? null,
          tokens: parseTokens(need(flags, "tokens")),
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
      const colors: Record<string, Rgb> = {};

      for (const spec of flags.rgb ?? []) {
        const eq = spec.indexOf("=");
        colors[eq === -1 ? func : spec.slice(0, eq).toLowerCase()] = parseRgb(
          eq === -1 ? spec : spec.slice(eq + 1),
        );
      }

      if (Object.keys(colors).length === 0) {
        throw new UsageError(
          "--rgb is required (R,G,B, or layd=R,G,B ... for --func layer)",
        );
      }

      return {
        kind: "led",
        edit: {
          op: "set-led",
          indicator: parseIndicator(need(flags, "indicator")),
          function: func,
          colors,
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
): Promise<unknown> {
  const profile = parseProfile(flags.profile);

  switch (op) {
    case "status":
      return sessionStatus(deps, profile, await sourceOrNull(deps, flags));
    case "discard":
      await saveSession(deps.stateDir, { profile });

      return sessionStatus(deps, profile, await sourceOrNull(deps, flags));
    case "load-file": {
      const from = need(flags, "from");
      const file = Bun.file(from);

      if (!(await file.exists())) {
        throw new CliError("file-missing", `${from} does not exist`);
      }

      const kind =
        flags.kind ??
        (from.replace(/^.*\//, "").startsWith("led") ? "led" : "layout");

      if (kind !== "layout" && kind !== "led") {
        throw new UsageError("--kind must be layout or led");
      }

      return editSession(deps, flags, profile, {
        kind,
        edit: { op: "replace-file", text: await file.text() },
      });
    }

    default:
      return editSession(deps, flags, profile, sessionEdit(op, flags));
  }
}

async function diffVerb(deps: Deps, flags: Flags): Promise<unknown> {
  const profile = parseProfile(flags.profile);
  const source = await sourceOrNull(deps, flags);
  const session = await loadSession(deps.stateDir, profile);

  if (!session) {
    throw new CliError("no-session", `no edit session for profile ${profile}`);
  }

  const disk = source ? await readDisk(source.dir, profile) : null;
  const state = deriveState(session, await loadRecord(deps.stateDir), disk);
  const files: { rel: string; diff: string }[] = [];

  const add = async (
    rel: string,
    part: Session["layout"] | Session["led"],
    rendered: string | null,
  ) => {
    if (!part || rendered === null) {
      return;
    }

    files.push({
      rel,
      diff: await diffFiles(deps.stateDir, rel, part.baseText, rendered),
    });
  };

  await add(layoutRel(profile), session.layout, renderLayout(session));
  await add(ledRel(profile), session.led, renderLed(session));

  return { profile, state, files };
}

async function applyVerb(deps: Deps, flags: Flags): Promise<unknown> {
  const profile = parseProfile(flags.profile);
  const source = await resolveSource(deps, flags.source);
  const record = await loadRecord(deps.stateDir);

  if (
    record?.phase.kind === "written" &&
    record.profile === profile &&
    source.device !== null &&
    source.device !== ""
  ) {
    console.log(
      JSON.stringify({ event: "retry-eject", device: source.device }),
    );

    return ejectAfterWrite(deps, record);
  }

  const plan = await planApply(deps, source, profile);
  console.log(JSON.stringify(describePlan(plan)));

  if (flags["dry-run"] === true) {
    return { event: "dry-run", profile };
  }

  return executeApply(deps, plan);
}

function handlers(
  deps: Deps,
): Record<string, (flags: Flags, positionals: string[]) => Promise<unknown>> {
  return {
    "vdrive status": () => vdriveStatus(deps),
    "vdrive eject": async () => {
      const status = await vdriveStatus(deps);

      if (
        status.observed.state !== "mounted" ||
        status.observed.device === null
      ) {
        throw new CliError("not-mounted", "nothing to eject", {
          next: status.next,
        });
      }

      if (status.pending_write?.phase.kind === "writing") {
        throw new CliError("write-in-progress", "a write cycle is running");
      }

      await deps.unmount(status.observed.device);

      return {
        event: "ejected",
        device: status.observed.device,
        next: `${CHORD.close} to close the v-Drive`,
      };
    },
    gui: () => launchGui(),
    watch: () => watch(deps, (status) => console.log(JSON.stringify(status))),
    inspect: async (flags) =>
      inspect(
        (await resolveSource(deps, flags.source)).dir,
        flags.profile === undefined ? undefined : parseProfile(flags.profile),
      ),
    view: async (flags) => {
      const profile = parseProfile(flags.profile);
      const source = await resolveSource(deps, flags.source);

      return view(
        source.dir,
        profile,
        needLayer(flags),
        await loadSession(deps.stateDir, profile),
      );
    },
    session: (flags, positionals) =>
      sessionVerb(deps, flags, positionals[1] ?? ""),
    diff: (flags) => diffVerb(deps, flags),
    apply: (flags) => applyVerb(deps, flags),
    verify: async (flags) =>
      verify(deps, await resolveSource(deps, flags.source)),
    backup: async (flags) =>
      backup(
        (await resolveSource(deps, flags.source)).dir,
        deps.stateDir,
        deps.now(),
      ),
    restore: async (flags, positionals) => {
      const from = positionals[1];

      if (from === undefined || from === "") {
        throw new UsageError("restore needs a backup dir or a .txt file");
      }

      const profile = parseProfile(flags.profile);
      const source = await resolveSource(deps, flags.source);
      await restoreSession(deps, source, profile, from);

      return sessionStatus(deps, profile, source);
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

    console.log(JSON.stringify(await handler(values, positionals)));

    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      console.log(JSON.stringify(error));

      return 1;
    }

    if (
      error instanceof UsageError ||
      (error instanceof TypeError &&
        /^(Unknown option|Option)/.test(error.message))
    ) {
      console.error(`adv360: ${error.message}\n${USAGE}`);

      return 2;
    }

    throw error;
  }
}

export { CHORD };

if (import.meta.main) {
  process.exit(await run(Bun.argv.slice(2)));
}
