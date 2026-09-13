# kinesis-smartset-arch

Native Linux editor for the Kinesis Advantage360 with the SmartSet engine (the non-ZMK model). Kinesis ships no Linux tool and the SmartSet App breaks under Wine; the keyboard's configuration is a set of text files on its own USB volume (the v-Drive). `adv360` reads them, shows them on a rendered keyboard, edits remaps, macros, tap-and-hold and LEDs, and writes them back with a backup, an atomic write, a read-back and an eject. A human, an agent, or both can drive it: every verb is a CLI call that prints JSON.

Two parts: the `adv360` binary (Bun/TypeScript, compiled, no runtime needed) and a Quickshell GUI themed by Omarchy.

## Install on Omarchy

```
git clone https://github.com/bengous/kinesis-smartset-arch ~/Work/kinesis-smartset-arch
cd ~/Work/kinesis-smartset-arch && ./install.sh
```

`install.sh` builds with `bun`, installs `~/.local/bin/adv360` and `~/.local/share/kinesis-smartset-arch/`, and adds a `Kinesis 360` row to the Omarchy menu extension file. It prints the optional Hyprland bind and the optional `omarchy plugin add … --enable` command that runs `adv360 watch` as a shell service (a notification when the v-Drive mounts). It never edits Hyprland config.

## Choreography

The keyboard opens, reloads and closes its own volume; only the human can press these chords.

| Step | Chord | What happens |
|---|---|---|
| Open the v-Drive | `SmartSet + Hotkey 3` | LEDs flash, the volume `ADV360` mounts, `adv360 vdrive status` says `mounted` |
| Edit | `adv360 gui` or `adv360 session …` | edits live in a session file, the keyboard is untouched |
| Apply | `adv360 apply --profile N` | backup, write, read back, eject; the drive shows `ejected` |
| Reload | `SmartSet + Hotkey 4` | the keyboard reads the new files |
| Reopen and verify | `SmartSet + Hotkey 3` twice, then `adv360 verify` | the tool compares the files with what it wrote |
| Close | `SmartSet + Hotkey 3` | after `adv360 vdrive eject` |
| Switch profile | `SmartSet + <digit>` | the tool shows the active profile with a star |

`vdrive status` always carries `next`, the chord or command to do next. Test on a spare profile (9); profile 1 is the daily layout.

## Safety guarantees

- Never writes `settings.txt` or anything under `firmware/`.
- Never mounts the v-Drive; the only volume command is `udisksctl unmount`.
- Backup of `layouts/ lighting/ settings/` before every write, under `~/.local/state/adv360/backups/<timestamp>/`.
- Atomic write: temp file on the same volume, fsync, rename, fsync of the directory, read-back and compare, then eject.
- One write cycle at a time (`~/.local/state/adv360/write.json` is the lock); a mismatch after reload marks the drive `corrupt-suspected` and points at the backup.
- Untouched files round-trip byte for byte (CRLF kept); unknown tokens are kept and shown raw.

## Commands

| Command | Does |
|---|---|
| `adv360 vdrive status` | composed state `absent / mounted / ejected / busy-writing / corrupt-suspected`, active profile, firmware, `next` |
| `adv360 vdrive eject` | `udisksctl unmount`, then the human closes the drive |
| `adv360 inspect [--profile N]` | every line of every layout and led file, with warnings |
| `adv360 view --profile N --layer base\|kp\|fn1\|fn2\|fn3` | the effective action per key, macros on their trigger, pending edits marked |
| `adv360 session set-remap\|set-taphold\|set-macro\|remove\|set-led\|load-file\|discard\|status --profile N …` | edit session, see `adv360` with no verb for the flags |
| `adv360 diff --profile N` | unified diff of the session against the disk |
| `adv360 apply --profile N [--dry-run]` | the write cycle; the plan line names every side effect first |
| `adv360 verify` | after the reload and reopen: `verified`, `unchanged` or `mismatch` |
| `adv360 backup` | copy the three folders to the state dir |
| `adv360 restore <backup-dir-or-file> --profile N` | open a session that replaces the profile's files; apply writes it |
| `adv360 watch` | one JSON line per change; notification on mount |
| `adv360 gui` | the Quickshell editor |

Every verb accepts `--source DIR` (or `ADV360_SOURCE=DIR`) to work on a copy instead of the mounted drive. Output: one JSON object per line; exit 0, 1 with `{"error":"<name>","message":…}`, 2 on usage. Details: `docs/capabilities.md`.

Example, from a terminal, with the v-Drive open:

```
adv360 session set-remap --profile 9 --layer base --pos caps --action esc
adv360 diff --profile 9
adv360 apply --profile 9
# press SmartSet + Hotkey 4, then SmartSet + Hotkey 3 twice
adv360 verify
```

## State dir

`~/.local/state/adv360/` (`$XDG_STATE_HOME/adv360`): `sessions/profile-N.json`, `write.json`, `backups/<timestamp>/`, `tmp/`.

## Dependencies

| Tool | Used for | When missing |
|---|---|---|
| `lsblk` | finding the `ADV360` volume | error `lsblk-missing` |
| `udisksctl` | eject | error `udisksctl-missing` at eject time; the write already happened, `apply` again retries the eject |
| `diff` (GNU) | `diff` verb | error `diff-failed` |
| `quickshell` + Omarchy (`/usr/share/omarchy/shell`) | the GUI | error `quickshell-missing` / `gui-files-missing`; the CLI works without them |
| `omarchy-notification-send` | notifications | a warning on stderr, nothing else |
| `bun` | building only | `install.sh` stops |

## Development

`bun run check` (typecheck, tests, qmllint, shellcheck, version match). Real keyboard files under `tests/fixtures/real/` are byte-for-byte copies and never change. Vocabulary in `CONTEXT.md`, rules in `AGENTS.md`, the SmartSet App research under `research/`.
