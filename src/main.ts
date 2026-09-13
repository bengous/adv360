import { parseArgs } from "node:util";
import { CliError, UsageError } from "./errors.ts";
import { inspect } from "./inspect.ts";
import { parseProfile } from "./source.ts";
import { layerFromName } from "./txt/layout.ts";
import { view } from "./view.ts";

const USAGE = `usage: adv360 <verb> [flags]
  inspect [--profile N] [--source DIR]
  view --profile N --layer base|kp|fn1|fn2|fn3 [--source DIR]`;

type Flags = { source?: string; profile?: string; layer?: string };

function resolveSource(flags: Flags): string {
  if (flags.source) return flags.source;
  throw new CliError("not-mounted", "open the v-Drive with SmartSet + Hotkey 3, or pass --source DIR", {
    next: "SmartSet + Hotkey 3",
  });
}

const HANDLERS: Record<string, (flags: Flags) => Promise<unknown>> = {
  inspect: (flags) => inspect(resolveSource(flags), flags.profile === undefined ? undefined : parseProfile(flags.profile)),
  view: (flags) => {
    const layer = layerFromName(flags.layer ?? "");
    if (!layer) throw new UsageError("--layer must be one of base kp fn1 fn2 fn3");
    return view(resolveSource(flags), parseProfile(flags.profile), layer);
  },
};

export async function run(argv: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { source: { type: "string" }, profile: { type: "string" }, layer: { type: "string" } },
    });
    const handler = HANDLERS[positionals.slice(0, 2).join(" ")] ?? HANDLERS[positionals[0] ?? ""];
    if (!handler) throw new UsageError(`unknown verb: ${positionals.join(" ") || "(none)"}`);
    console.log(JSON.stringify(await handler(values)));
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      console.log(JSON.stringify(e));
      return 1;
    }
    if (e instanceof UsageError || (e instanceof TypeError && e.message.startsWith("Unknown option"))) {
      console.error(`adv360: ${e.message}\n${USAGE}`);
      return 2;
    }
    throw e;
  }
}

if (import.meta.main) process.exit(await run(Bun.argv.slice(2)));
