# TypeScript on Bun for core and CLI, Quickshell QML for the GUI, JSON over stdout as the only boundary

The core (parsers, state machines, write cycle) and the CLI are TypeScript compiled by `bun build --compile` into one static `adv360` binary, so nothing on the Omarchy menu PATH needs a runtime. The GUI is Quickshell QML: a standalone `FloatingWindow` today, the same components inside an Omarchy `panel` plugin later, themed by Omarchy's own `Color`/`Style` singletons. The GUI never touches files; every action is one `adv360` process whose JSON stdout is the contract, and the same handlers back the future MCP server.

Discriminated unions with `switch` + `never` model the three machines (v-Drive, write record, session); `bun test` is the runner; JSON is native; the user's tooling is Bun.

## Considered Options

- Rust core: rejected, declined by the user.
- Python + GTK: rejected, no exhaustive matching and no path to the QML panel.
- GTK4 / iced / egui: rejected, shares nothing with the Omarchy shell.
- Daemon + socket: rejected, a one-shot CLI plus `watch` serves every client.
- Browser-window UI: rejected, not native.

## Consequences

- One binary, one JSON schema, three consumers (GUI, agent, MCP): schemas evolve additively only.
- QML code depends on Omarchy's `Commons`; the standalone GUI symlinks it into a cache dir at launch because the plugin validator refuses symlinks in the repo.
- Bun is installed through mise and is not on the Hyprland PATH: the compiled binary is the only thing installed to `~/.local/bin`.
