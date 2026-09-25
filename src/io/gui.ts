import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { CliError } from "../errors.ts";

// Inside a `bun build --compile` binary the sources live under /$bunfs.
const COMPILED = import.meta.dir.startsWith("/$bunfs");

export function cliCommand(): string[] {
  return COMPILED
    ? [process.execPath]
    : ["bun", join(import.meta.dir, "..", "main.ts")];
}

export function shareDir(): string {
  return (
    process.env["ADV360_SHARE_DIR"] ??
    (COMPILED
      ? join(homedir(), ".local", "share", "adv360")
      : join(import.meta.dir, "..", ".."))
  );
}

async function guiDir(): Promise<string> {
  const dir = join(shareDir(), "gui");

  await stat(join(dir, "shell.qml")).catch(() => {
    throw new CliError("gui-files-missing", `${dir}/shell.qml is missing`);
  });

  return dir;
}

export async function launchGui(): Promise<{
  event: "gui-exited";
  code: number;
}> {
  const dir = await guiDir();

  const proc = (() => {
    try {
      return Bun.spawn(["quickshell", "-p", dir], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, ADV360_CMD: JSON.stringify(cliCommand()) },
      });
    } catch (error) {
      throw new CliError(
        "quickshell-missing",
        `quickshell is not installed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })();

  return { event: "gui-exited", code: await proc.exited };
}
