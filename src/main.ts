import { eject, vdriveStatus, watch } from "./app/status.ts";
import { parseFlags, USAGE } from "./cli/flags.ts";
import {
  applyVerb,
  backupVerb,
  diffVerb,
  inspectVerb,
  restoreVerb,
  sessionVerb,
  verifyVerb,
  viewVerb,
} from "./cli/verbs.ts";
import type { Verb } from "./cli/verbs.ts";
import { CliError, UsageError } from "./errors.ts";
import { realDeps } from "./io/deps.ts";
import type { Deps } from "./io/deps.ts";
import { launchGui } from "./io/gui.ts";

const VERBS = new Map<string, Verb>([
  ["vdrive status", (deps) => vdriveStatus(deps)],
  ["vdrive eject", (deps) => eject(deps)],
  ["gui", () => launchGui()],
  ["watch", (deps) => watch(deps)],
  ["inspect", inspectVerb],
  ["view", viewVerb],
  ["session", sessionVerb],
  ["diff", diffVerb],
  ["apply", applyVerb],
  ["verify", verifyVerb],
  ["backup", backupVerb],
  ["restore", restoreVerb],
]);

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

    const verb =
      VERBS.get(positionals.slice(0, 2).join(" ")) ??
      VERBS.get(positionals[0] ?? "");

    if (!verb) {
      throw new UsageError(
        `unknown verb: ${positionals.join(" ") || "(none)"}`,
      );
    }

    deps.emit(JSON.stringify(await verb(deps, flags, positionals)));

    return 0;
  } catch (error) {
    return exitCodeOf(deps, error);
  }
}

if (import.meta.main) {
  process.exit(await run(Bun.argv.slice(2)));
}
