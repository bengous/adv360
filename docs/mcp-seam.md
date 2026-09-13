# Seam: an MCP server

An MCP server for agents either imports the handlers (`src/inspect.ts`, `src/view.ts`, `src/session.ts`, `src/write.ts`, `src/vdrive.ts`, with `realDeps()` from `src/deps.ts`) or spawns `adv360 <verb>` and forwards the JSON. One tool per verb, same names, same shapes, same named errors.

Rules the server enforces on top of the CLI:

- `apply` is offered only after `diff` was shown to the human in the same conversation, and only with the profile the human named.
- The chords stay human: the server reports `next` from `vdrive status` and never claims to mount, reload or close the v-Drive.
- `settings.txt` and `firmware/` are not exposed as writable resources.
- `--source DIR` is allowed for dry runs on a copy; the mounted v-Drive is the default.
