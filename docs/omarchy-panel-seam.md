# Seam: the Omarchy `panel` plugin

Today the manifest declares `kinds: ["service"]` only: `omarchy/Service.qml` keeps `adv360 watch` alive. The standalone GUI is `adv360 gui`, a Quickshell `FloatingWindow` assembled from symlinks in the cache dir.

To host the same editor inside the Omarchy shell:

1. Add `"panel"` to `kinds` and `entryPoints.panel: "gui/Panel.qml"`.
2. `gui/Panel.qml` is a `qs.Ui` `Panel` whose content is the same `components/*` (`TopBar`, `Keyboard`, `Sidebar`, `LightingSidebar`, `BottomPane`) and the same `CliProcess`, fed by the same JSON verbs. `shell.qml` keeps only the window and the process queue; the panel reuses that queue as a small `Cli.qml` object if the duplication hurts.
3. `qs.Commons` and `qs.Ui` resolve on their own inside the shell: no symlinks, no run dir.
4. Summon with `omarchy-shell shell summon io.github.bengous.kinesis-smartset-arch`; the menu row's action becomes that command when the panel exists.

Nothing in `src/` changes: the panel is one more consumer of the CLI contract.
