# Glossary

**Profile**:
One of the 9 configurations stored on the keyboard as `layouts/layoutN.txt` + `lighting/ledN.txt`. The keyboard selects it with `SmartSet + <digit>`; the tool only reads which one is active.

**Layer**:
One of `base keypad function1 function2 function3`, a `<header>` block inside a layout file. Shown as `Base Kp Fn1 Fn2 Fn3`.

**Position**:
The token naming a physical key (`caps`, `hk3`, `rctr`), from Appendix A of the Direct Programming Guide. Never changes with the layer.

**Action**:
The token a key performs (`esc`, `f6`, `caxx`). Unknown tokens are kept and shown raw.

**Remap**:
`[position]>[action]`: one key, one action.

**Macro**:
`{trigger}{cotrigger}>{tokens…}`: a key (plus an optional modifier co-trigger) playing a token sequence with optional speed `{sN}`, multiplay `{xN}`, delays `{dNNN}` `{dran}`, and strokes `{-x}` `{+x}`.

**Tap-and-hold**:
`[position]>[tap][t&hNNN][hold]`: two actions on one key by press duration.

**Indicator**:
One of the 6 RGB LEDs `IND1..6` (left module 1-3, right module 4-6), each with a function and colours.

**v-Drive**:
The keyboard's FAT volume (label `ADV360`) that the human opens with `SmartSet + Hotkey 3`. The tool observes it, writes to it, ejects it; it never mounts it.
_Avoid_: "mount" as a verb the tool performs.

**Source**:
Where files are read from: the mounted v-Drive, or a directory given with `--source`.

**Edit session**:
The pending edits for one profile, stored under `~/.local/state/adv360/sessions/`. Its state (`clean dirty conflict applied`) is derived, never stored.

**Base**:
The on-disk text captured by the first edit of a session; a differing disk text makes the session `conflict`.

**Backup**:
A timestamped copy of `layouts/ lighting/ settings/` under `~/.local/state/adv360/backups/`. Taken before every write. Distinct from a named backup file beside the layouts (`layout1.txt.backup`), which is data on the v-Drive.

**Write record**:
`~/.local/state/adv360/write.json`, the lock and the log of the one write cycle in flight or awaiting verification.

**Write cycle**:
The steps of `apply` after the plan: record, backup, temp files, rename, read back, eject. Non-transactional; the write record is the compensation.

**Decision**:
The pure result of a verb's decide phase (a plan, a verdict, an edited session), computed from gathered data before any side effect.

**Refresh**:
The keyboard reloading its files after `SmartSet + Hotkey 4`. Only the human triggers it.

**Effective action**:
What a key does in a layer after the firmware's rules: the last matching line wins, disabled (`*`) lines are skipped, otherwise the default.

**Active**:
Only the profile number read from `settings.txt`.
_Avoid_: "active" for anything else (layer, session, window).
