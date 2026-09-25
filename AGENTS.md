# adv360

Native Omarchy editor for the Kinesis Advantage360 (SmartSet engine) v-Drive: one `adv360` binary (Bun/TypeScript) speaking JSON on stdout, a Quickshell QML GUI on top. Vocabulary: `CONTEXT.md`. Verbs, states, write cycle: `docs/capabilities.md`. Stack decision: `docs/adr/0001-stack.md`.

## Architecture

1. Types first: a rule lives in one `parse*` beside its type; data clumps get a type; exceptions propagate to `run()` in `src/main.ts`, the single handler.
2. Every verb is gather → pure decide → apply; the decide phase is tested on plain data.
3. Layers, one folder each, checked by `tools/check-layers.sh` inside `check`: `model/` (pure decisions and the `.txt` grammar under `model/txt/`; imports nothing above it) → `io/` (filesystem, JSON decoders, the `Deps` ports and their fake) → `app/` (use cases: gather → decide → apply) → `cli/` (flags and one adapter per verb) → `main.ts` (dispatch, exit codes). Only `main.test.ts` and `testkit.ts` import `main.ts`. Tests sit beside their module.
4. Tests: `given …, when …, then …` names, ≤10 statements, whole-object `toEqual`, fakes at the ports, a contract test holds the fake and the real adapter to the same spec.

## Recorded decisions

- The filesystem is a real adapter (a tempdir in tests): atomic write + fsync + rename is the product, a fake FS would lie about it.
- Action tokens and positions are opaque strings; firmware ignores unknown tokens and nothing is validated on write.
- The write cycle is non-transactional by design: the write record is the compensation, each step of `executePlan` carries its own.

## Invariants

- Never write `settings.txt` or `firmware/`. Never mount. Only `udisksctl unmount` touches the volume beyond file writes.
- Every write: backup first, temp file on the same volume, rename, read back, eject. Every side effect is named in the printed plan before it happens.
- Round-trip of an untouched `.txt` is byte-identical (CRLF kept: the keyboard expects it).
- One write cycle at a time: `write.json` is the lock.

## Contracts

- Public surface: verb names and flags, JSON shapes, exit codes (`0` ok, `1` named error, `2` usage). Shapes evolve additively.
- `data/keyboard.json` and `data/tokens.json` are read by every consumer of the CLI contract (`docs/omarchy-panel-seam.md` describes the next one): additive changes only.
- Pre-v1: breaking changes allowed, docs updated in the same commit, no compat shims.

## Workflow

- Gate: `bun run check` before every commit. One test file: `bun test src/<name>.test.ts`.
- Never run `adv360 gui` or `quickshell` on the user's session: every visual check goes through `tools/gui-shot.sh`, which draws on a headless output (`tests/gui/*.shot`).

## Style

- Strict TypeScript (`tsconfig.json`), zero runtime dependencies, `Bun.spawn({ timeout })` for subprocesses.
- Discriminated unions with `switch` + `never` for states.
- Comments only for an irreplaceable why (external constraint, workaround, contract policy).
- Real fixtures under `tests/fixtures/real/` are byte-for-byte copies of the keyboard, never edited.
- QML: the adv360 palette (`gui/theme/Theme.qml`) and controls (`gui/controls/`), never Omarchy's `qs.Commons` or `qs.Ui`; one component per file; the GUI never touches files.
- GUI: `gui/shell.qml` holds the state and every action; views bind to it, and clicks and the `adv360` IPC target call the same functions. Pure logic lives in `gui/*.mjs` with a `bun test` file beside it; the QML engine imports these modules as they are, so no object spread, `at()`, `flat()`, `flatMap()`, `toSorted()` or `replaceAll()`.
- Commits: English, imperative, scoped by phase.
