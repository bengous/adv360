# kinesis-smartset-arch

Native Omarchy editor for the Kinesis Advantage360 (SmartSet engine) v-Drive: one `adv360` binary (Bun/TypeScript) speaking JSON on stdout, a Quickshell QML GUI on top. Vocabulary: `CONTEXT.md`. Verbs, states, write cycle: `docs/capabilities.md`. Stack decision: `docs/adr/0001-stack.md`.

## Rules

`docs/rules/` is vendored from the Unlockers skills library (sync: `tools/vendor-rules.sh`; never edit the copies). Apply them in the library's order:

1. Types first: `code-design-rules.md` (a rule lives in one `parse*` beside its type; data clumps get a type; exceptions propagate to `run()` in `src/main.ts`, the single handler).
2. Then decide/apply: `hexagonal-architecture-rules.md` and `design-patterns.md` (every verb is gather → pure decide → apply; the decide phase is tested on plain data).
3. Then layers: `txt/*` → `source.ts` → pure decisions (`record`, `session`, `edit`, `vdrive`, `plan`, `verify`, `restore`, `diff`) → fs adapters (`disk`, `state`, `backup`) → use cases (`apply`, `session-edit`, `status`) → `verbs.ts` → `main.ts`. Nothing imports `main.ts`; `deps.ts` (the ports) is imported by the use cases, `verbs.ts`, `main.ts` and `vdrive.ts` (the `Observation` type) only.
4. Tests: `testing-rules.md` (`given …, when …, then …` names, ≤10 statements, whole-object `toEqual`, fakes at the ports, `adapter-contract-testing.md` keeps the fake honest).

## Recorded decisions

- The filesystem is a real adapter (a tempdir in tests): atomic write + fsync + rename is the product, a fake FS would lie about it.
- Action tokens and positions are opaque strings; firmware ignores unknown tokens and nothing is validated on write.
- The write cycle is non-transactional by design (rule 3 of the hexagonal rules): the write record is the compensation, each step of `executePlan` carries its own.

## Invariants

- Never write `settings.txt` or `firmware/`. Never mount. Only `udisksctl unmount` touches the volume beyond file writes.
- Every write: backup first, temp file on the same volume, rename, read back, eject. Every side effect is named in the printed plan before it happens.
- Round-trip of an untouched `.txt` is byte-identical (CRLF kept: the keyboard expects it).
- One write cycle at a time: `write.json` is the lock.

## Contracts

- Public surface: verb names and flags, JSON shapes, exit codes (`0` ok, `1` named error, `2` usage). Shapes evolve additively.
- `data/keyboard.json` and `data/tokens.json` are read by the CLI, the GUI and the future panel: additive changes only.
- Pre-v1: breaking changes allowed, docs updated in the same commit, no compat shims.

## Workflow

- Feature: `.claude/skills/scope-challenge`, then `docs/rules/feature-workflow.md`.
- Bug: `docs/rules/bugfix-workflow.md`; the second bug of a kind: `.claude/skills/bugszero-root-cause`.
- Before merge: `review-pr` for a small change, else `review-complexity` + `review-testing` + `review-architecture` (all under `.claude/skills/`).
- Gate: `bun run check` before every commit. One test file: `bun test src/<name>.test.ts`.

## Style

- Strict TypeScript (`tsconfig.json`), zero runtime dependencies, `Bun.spawn({ timeout })` for subprocesses.
- Discriminated unions with `switch` + `never` for states.
- Comments only for an irreplaceable why (external constraint, workaround, contract policy).
- Real fixtures under `tests/fixtures/real/` are byte-for-byte copies of the keyboard, never edited.
- QML: Omarchy `Color`/`Style` tokens; one component per file; the GUI never touches files.
- Commits: English, imperative, scoped by phase.
