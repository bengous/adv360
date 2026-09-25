# Seam: the Omarchy `panel` plugin

Today the manifest declares `kinds: ["service"]` only: `omarchy/Service.qml` keeps `adv360 watch` alive. The standalone GUI is `adv360 gui`: `quickshell -p <share>/gui`, whose `shell.qml` holds the state, the process queue and the IPC, and hosts `components/Editor.qml` in a `FloatingWindow`.

To host the same editor inside the Omarchy shell:

1. Add `"panel"` to `kinds` and `entryPoints.panel: "gui/Panel.qml"`.
2. `gui/Panel.qml` is a `qs.Ui` `Panel` whose content is `components/Editor.qml`, fed by the same JSON verbs. The state, the process queue and the IPC leave `shell.qml` for a shared object both hosts bind to.
3. The GUI imports nothing from Omarchy (its palette and controls live under `gui/theme` and `gui/controls`), so the panel keeps the adv360 look inside the shell.
4. Summon with `omarchy-shell shell summon io.github.bengous.adv360`; the menu row's action becomes that command when the panel exists.

Nothing in `src/` changes: the panel is one more consumer of the CLI contract.
