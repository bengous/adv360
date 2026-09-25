# TypeScript on Bun for core and CLI, Quickshell QML for the GUI, JSON over stdout as the only boundary

The core (parsers, state machines, write cycle) and the CLI are TypeScript compiled by `bun build --compile` into one static `adv360` binary, so nothing on the Omarchy menu PATH needs a runtime. The GUI is Quickshell QML: a standalone `FloatingWindow` today, the same components inside an Omarchy `panel` plugin later, with its own dark palette and controls (`gui/theme`, `gui/controls`) rather than Omarchy's `qs.Commons` and `qs.Ui`, whose controls read the Omarchy theme and would mix two palettes on one screen. The GUI never touches files; every action is one `adv360` process whose JSON stdout is the contract, and the same handlers back the future MCP server.

Discriminated unions with `switch` + `never` model the three machines (v-Drive, write record, session); `bun test` is the runner; JSON is native; the user's tooling is Bun.

## Considered Options

- Rust core: rejected, declined by the user.
- Python + GTK: rejected, no exhaustive matching and no path to the QML panel.
- GTK4 / iced / egui: rejected, shares nothing with the Omarchy shell.
- Daemon + socket: rejected, a one-shot CLI plus `watch` serves every client.
- Browser-window UI: rejected, not native.

## Consequences

- One binary, one JSON schema, three consumers (GUI, agent, MCP): schemas evolve additively only.
- The GUI depends on Quickshell alone: `adv360 gui` runs `quickshell -p <share>/gui`, which reads `../data`, with no run dir.
- Bun is installed through mise and is not on the Hyprland PATH: the compiled binary is the only thing installed to `~/.local/bin`.
