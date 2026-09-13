# Capabilities

Every verb is `adv360 <verb> [flags]`, prints one JSON value per line on stdout (one line for every verb except `apply`, which prints the plan first, and `watch`), exits 0 on success, 1 with `{"error":"<kebab-name>", ...fields, "message"}` on a named failure, 2 on usage (text on stderr). Schemas evolve additively. `adv360` without a verb prints the flag reference.

| Verb | Trigger | Reads | Transitions / side effect |
|---|---|---|---|
| `vdrive status` | GUI poll (1 s), agent | `lsblk -J` (label `ADV360`), mount path, write record, `settings.txt` | none; reports `state` (`absent / mounted / ejected / busy-writing / corrupt-suspected`), `active_profile`, `firmware`, `pending_write`, `next` (chord to press), `version`, `stateDir` |
| `watch` | Omarchy service, agent | polls 1 s | one JSON line per change; `omarchy-notification-send` on `absent → mounted` only |
| `inspect [--profile N]` | any | layout + led files (`--source DIR` or the mount) | none; 9 profiles (all when no `--profile`) with raw entries (`line layer kind disabled`), warnings (`unparsed`, `missing-layer-header`), active profile, named backups such as `layout1.txt.backup` |
| `view --profile N --layer L` | GUI, agent | same | none; effective action per key (later wins, disabled skipped), macros attached to their trigger with `cotrigger`, pending session overlay |
| `session set-remap / set-taphold / set-macro / remove / set-led / load-file / discard / status --profile N` | GUI click, agent | session file; the first edit captures the on-disk base | `clean → dirty`, `dirty → clean` (discard); a `conflict` session accepts only `discard`; writes only under `~/.local/state/adv360/sessions/` |
| `diff --profile N` | any | session + on-disk | none; unified `.txt` diff, CRLF preserved |
| `apply --profile N [--dry-run]` | human confirm; agent after the human confirmed | session, v-Drive, write record | full write cycle; `--dry-run` prints the plan only; notifies "written, press SmartSet + Hotkey 4"; reports `outcome: {kind: "ejected", next}` or `{kind: "verified-by-readback"}` under `--source` |
| `verify` | GUI on re-mount, agent | write record + on-disk | `ejected → verified` (record and session cleared) / `unchanged` (record cleared, session kept) / `mismatch` (record `failed`, `corrupt-suspected`) |
| `backup` | any, and inside `apply` | `layouts/ lighting/ settings/` | copy to `~/.local/state/adv360/backups/<ts>/`; listing is `ls` |
| `restore <dir-or-file> --profile N` | any | a backup dir or one `.txt` | opens a `replace-file` session; the write goes through `apply` |
| `gui` | menu, bind | share dir | prepares the Quickshell run dir, execs `quickshell -p` |
| switch profile | **human only** (`SmartSet + <digit>`) | — | the tool shows the active profile and the chord |
| open / reload / close v-Drive | **human only** (`SmartSet + Hotkey 3` / `Hotkey 4` / `Hotkey 3`) | — | the tool detects and instructs; never mounts |

Source resolution: `--source DIR`, else the mounted v-Drive, else error `not-mounted` with the chord in `message`.

## Never

- Write `settings.txt` or anything under `firmware/`.
- Mount, or run anything but `udisksctl unmount` against the v-Drive.
- Write outside the v-Drive and `~/.local/state/adv360/`.

## State machines

- **VDrive** (observed, pure `observe(Observation)`): `{state:"absent"} | {state:"ejected", device} | {state:"mounted", mount, device: string|null}`. `device: null` only under `--source`: no eject step in the plan, by type. `vdrive status` composes: `failed` record → `corrupt-suspected`; `writing` / `written` record → `busy-writing`; else observed. `plan()` accepts only `mounted`; `eject()` accepts only a device and is rejected `write-in-progress` while the record is `writing`.
- **WriteRecord** at `~/.local/state/adv360/write.json`, created with `wx` (the file is the lock: one cycle at a time because eject is volume-wide): `{profile, started_at, backup_dir, files:[{rel, before, after}], phase}`, `phase: writing | written | ejected | failed{step: rename|readback|verify|died, error}`. A `writing` record found by a later invocation means the writer died (the cycle lasts milliseconds) → `failed{died}`; no pid tracking.
- **Session** per profile at `~/.local/state/adv360/sessions/profile-N.json`: `{profile, layout?: {baseText, edits: LayoutEdit[]}, led?: {baseText, edits: LedEdit[]}}`; the file exists iff at least one edit. `LayoutEdit = set-remap | set-taphold | set-macro | remove | replace-file`; `LedEdit = set-led | replace-file`. State is derived, never stored: record `written | ejected` for the profile → `applied`; no file → `clean`; disk readable and any `baseText ≠ disk` → `conflict`; else `dirty` (absent v-Drive is dirty, not conflict).

## Write cycle (`apply`)

0. observe + load + `plan()`: named error, nothing touched.
1. print `{"event":"plan"}` naming every side effect (`--dry-run` stops here).
2. create the record `writing`.
3. backup + fsync (failure: record removed, `backup-failed`).
4. write `.<name>.adv360-tmp` on the same volume + fsync (failure: tmp removed, record removed, `write-failed`).
5. rename + fsync dir (failure: `failed{rename}` → corrupt-suspected).
6. read back and compare (mismatch: `failed{readback}` → corrupt-suspected).
7. record `written`.
8. `udisksctl unmount -b` (failure: `eject-failed`, record stays `written`; a re-run of `apply` retries the eject).
9. record `ejected`, notify.
10. the human presses `SmartSet + Hotkey 4`, reopens the v-Drive (`Hotkey 3` twice) → `verify`.

Under `--source` steps 8-10 are skipped and the report carries `outcome.kind = "verified-by-readback"`; after an eject it carries `outcome = {kind: "ejected", next}`. Layout and LED of one profile are written in one cycle, one eject.

`apply` rejects `not-mounted`, `no-session`, `no-change`, `session-conflict`, `write-pending`, `write-in-progress`; `failed` does not block a new apply (restore must stay possible). A `written` record for the same profile makes `apply` retry only the eject (`{"event":"retry-eject"}`).

Other named errors: `bad-profile`, `layer-missing`, `no-base` (first edit with no readable disk), `file-missing` (`load-file`), `restore-source-missing`, `no-write-record` (`verify`), `backup-failed`, `write-failed`, `corrupt-suspected` (rename or read-back failed), `eject-failed`, `lsblk-missing` / `lsblk-failed`, `udisksctl-missing`, `diff-failed`, `bad-json` (a state file or the `lsblk` output does not decode).

## Deferred to v2

Presets (Dvorak, Colemak, Workman), Quick Thumb Keys (Mac / Linux / Windows modes), assigning by typing the physical key, `Save As` copy-to-profile (covered by `session load-file`), Export (covered by `backup`), firmware flashing, Advantage2, the MCP server, the Omarchy `panel` plugin.
