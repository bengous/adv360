import { applyVerb } from "./apply.ts";
import { backup, backupDir } from "./backup.ts";
import { realDeps } from "./deps.ts";
import type { Deps } from "./deps.ts";
import { diffVerb } from "./diff.ts";
import { CliError, UsageError } from "./errors.ts";
import { need, parseFlags, USAGE } from "./flags.ts";
import type { Flags } from "./flags.ts";
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
import { editFromFlags } from "./session-flags.ts";
import type { Edit } from "./session.ts";
import { parseProfile } from "./source.ts";
import type { Profile } from "./source.ts";
import { loadSession } from "./state.ts";
import {
  eject,
  findSource,
  findSourceOrNull,
  vdriveStatus,
  watch,
} from "./status.ts";
import { parseLayerName } from "./txt/layout.ts";
import { verify } from "./verify.ts";
import { view } from "./view.ts";

function sessionEditOf(op: string, flags: Flags): Promise<Edit | null> {
  switch (op) {
    case "status":
    case "discard":
      return Promise.resolve(null);
    case "load-file":
      return loadFileEdit(need(flags, "from"), flags.kind);
    default:
      return Promise.resolve(editFromFlags(op, flags));
  }
}

async function sessionVerb(
  deps: Deps,
  flags: Flags,
  op: string,
): Promise<Json> {
  const profile = parseProfile(flags.profile);
  const edit = await sessionEditOf(op, flags);
  const source = await findSourceOrNull(deps, flags.source);

  if (edit !== null) {
    return editSession(deps, profile, source, edit);
  }

  return op === "discard"
    ? discardSession(deps, profile, source)
    : sessionStatus(deps, profile, source);
}

async function viewVerb(deps: Deps, flags: Flags): Promise<Json> {
  const profile = parseProfile(flags.profile);
  const source = await findSource(deps, flags.source);
  const layer = parseLayerName(need(flags, "layer"));
  const session = await loadSession(deps.stateDir, profile);

  return view(source.dir, profile, layer, session);
}

async function restoreVerb(
  deps: Deps,
  flags: Flags,
  from: string | undefined,
): Promise<Json> {
  if (from === undefined || from === "") {
    throw new UsageError("restore needs a backup dir or a .txt file");
  }

  const profile = parseProfile(flags.profile);

  return restore(deps, await findSource(deps, flags.source), profile, from);
}

type Handler = (flags: Flags, positionals: string[]) => Promise<Json>;

function optionalProfile(flags: Flags): Profile | undefined {
  return flags.profile === undefined ? undefined : parseProfile(flags.profile);
}

function handlers(deps: Deps): Map<string, Handler> {
  const source = (f: Flags) => findSource(deps, f.source);
  const stamp = () => backupDir(deps.stateDir, deps.now());

  return new Map<string, Handler>([
    ["vdrive status", () => vdriveStatus(deps)],
    ["vdrive eject", () => eject(deps)],
    ["gui", () => launchGui()],
    ["watch", () => watch(deps)],
    [
      "inspect",
      async (f) => inspect((await source(f)).dir, optionalProfile(f)),
    ],
    ["view", (f) => viewVerb(deps, f)],
    ["session", (f, p) => sessionVerb(deps, f, p[1] ?? "")],
    [
      "diff",
      async (f) =>
        diffVerb(
          deps,
          parseProfile(f.profile),
          await findSourceOrNull(deps, f.source),
        ),
    ],
    [
      "apply",
      async (f) =>
        applyVerb(
          deps,
          parseProfile(f.profile),
          await source(f),
          f["dry-run"] === true,
        ),
    ],
    ["verify", async (f) => verify(deps, await source(f))],
    ["backup", async (f) => backup((await source(f)).dir, stamp())],
    ["restore", (f, p) => restoreVerb(deps, f, p[1])],
  ]);
}

// The single exception handler: a named error is exit 1 on stdout, a usage error exit 2 on stderr.
export function exitCodeOf(deps: Deps, cause: unknown): number {
  if (cause instanceof CliError) {
    deps.emit(JSON.stringify(cause));

    return 1;
  }

  if (
    cause instanceof UsageError ||
    (cause instanceof TypeError &&
      /^(Unknown option|Option)/.test(cause.message))
  ) {
    deps.warn(`adv360: ${cause.message}\n${USAGE}`);

    return 2;
  }

  throw cause;
}

export async function run(
  argv: string[],
  deps: Deps = realDeps(),
): Promise<number> {
  try {
    const { flags, positionals } = parseFlags(argv);
    const table = handlers(deps);

    const handler =
      table.get(positionals.slice(0, 2).join(" ")) ??
      table.get(positionals[0] ?? "");

    if (!handler) {
      throw new UsageError(
        `unknown verb: ${positionals.join(" ") || "(none)"}`,
      );
    }

    deps.emit(JSON.stringify(await handler(flags, positionals)));

    return 0;
  } catch (error) {
    return exitCodeOf(deps, error);
  }
}

if (import.meta.main) {
  process.exit(await run(Bun.argv.slice(2)));
}
