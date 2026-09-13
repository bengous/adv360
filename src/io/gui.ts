import { mkdir, rm, stat, symlink } from "node:fs/promises";
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

// Quickshell resolves qs.Commons / qs.Ui against the config root, and the plugin validator
// refuses symlinks in the repo, so the run dir is assembled from symlinks in the cache.
export async function prepareRunDir(): Promise<string> {
  const share = shareDir();

  const omarchy = join(
    process.env["OMARCHY_PATH"] ?? "/usr/share/omarchy",
    "shell",
  );

  const runDir = join(
    process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"),
    "adv360",
    "shell",
  );

  await rm(runDir, { recursive: true, force: true });
  await mkdir(runDir, { recursive: true });

  const links: [string, string][] = [
    ["shell.qml", join(share, "gui", "shell.qml")],
    ["CliProcess.qml", join(share, "gui", "CliProcess.qml")],
    ["components", join(share, "gui", "components")],
    ["data", join(share, "data")],
    ["Commons", join(omarchy, "Commons")],
    ["Ui", join(omarchy, "Ui")],
  ];

  for (const [name, target] of links) {
    await stat(target).catch(() => {
      throw new CliError("gui-files-missing", `${target} is missing`);
    });
    await symlink(target, join(runDir, name));
  }

  return runDir;
}

export async function launchGui(): Promise<{
  event: "gui-exited";
  code: number;
}> {
  const runDir = await prepareRunDir();

  const proc = (() => {
    try {
      return Bun.spawn(["quickshell", "-p", runDir], {
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
