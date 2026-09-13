# kinesis-smartset-arch

Native Omarchy editor for the Kinesis Advantage360 (SmartSet engine) v-Drive: one `adv360` binary (Bun/TypeScript) speaking JSON on stdout, a Quickshell QML GUI on top. Vocabulary: `CONTEXT.md`. Verbs, states, write cycle: `docs/capabilities.md`. Stack decision: `docs/adr/0001-stack.md`.

## Invariants

- Decisions are pure `state → state` functions; I/O runs at the edge (`src/deps.ts` holds the real and fake dependencies).
- Never write `settings.txt` or `firmware/`. Never mount. Only `udisksctl unmount` touches the volume beyond file writes.
- Every write: backup first, temp file on the same volume, rename, read back, eject. Every side effect is named in the printed plan before it happens.
- Round-trip of an untouched `.txt` is byte-identical (CRLF kept: the keyboard expects it).
- Action tokens are never validated on write; unknown tokens stay opaque.
- One write cycle at a time: `write.json` is the lock.

## Contracts

- Public surface: verb names and flags, JSON shapes, exit codes (`0` ok, `1` named error, `2` usage). Shapes evolve additively.
- `data/keyboard.json` and `data/tokens.json` are read by the CLI, the GUI and the future panel: additive changes only.
- Pre-v1: breaking changes allowed, docs updated in the same commit, no compat shims.

## Gate

`bun run check` before every commit. One test file: `bun test src/<name>.test.ts`.

## Style

- Strict TypeScript (`tsconfig.json`), zero runtime dependencies, `Bun.spawn({ timeout })` for subprocesses.
- Discriminated unions with `switch` + `never` for states.
- Comments only for an irreplaceable why (external constraint, workaround, contract policy).
- Tests: behaviour-sentence names; real fixtures under `tests/fixtures/real/` are byte-for-byte copies of the keyboard, never edited.
- QML: Omarchy `Color`/`Style` tokens; one component per file; the GUI never touches files.
- Commits: English, imperative, scoped by phase.
