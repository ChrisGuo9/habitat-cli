# SQLite Persistence Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Replace the Habitat CLI's active JSON persistence with Bun's built-in SQLite database at `habitat.sqlite`.

**Architecture:** Preserve the typed state API consumed by commands, but replace file helpers with a small SQLite repository. Store each existing state aggregate as a JSON payload in a keyed SQLite table so the migration remains behavior-preserving and avoids duplicating Kepler-owned data.

**Tech Stack:** Bun, `bun:sqlite`, TypeScript, Bun test.

## Global Constraints

- Use Bun's built-in SQLite support; do not add a database package.
- Local Habitat state belongs in SQLite; Kepler-owned catalogs and world state remain remote.
- Do not read or write the old `.habitat/*.json` files.
- Keep `habitat.sqlite` relative to the caller's working directory.
- Preserve beginner-friendly command errors and existing behavior.

### Task 1: Add red persistence-boundary tests

**Files:**
- Modify: `src/state.test.ts`

- [ ] Add tests proving state creates `habitat.sqlite`, persists typed values, and does not create `.habitat/*.json` files.
- [ ] Add a test proving a fresh working directory returns missing state after the database is absent.
- [ ] Run the focused tests and confirm they fail because the current implementation still writes JSON.

### Task 2: Replace JSON storage with Bun SQLite

**Files:**
- Modify: `src/state.ts`

- [ ] Import `Database` from `bun:sqlite` and define `habitat.sqlite` as the database path.
- [ ] Initialize `habitat_state(key TEXT PRIMARY KEY, value TEXT NOT NULL)`.
- [ ] Implement keyed JSON payload reads, writes, and deletes while keeping current exported functions unchanged.
- [ ] Keep default-state helpers and module behavior unchanged.
- [ ] Run focused state tests, then the full test suite.

### Task 3: Migrate integration tests away from JSON assumptions

**Files:**
- Modify: `src/index.test.ts`
- Modify: `src/state.test.ts`

- [ ] Replace test fixtures that inspect `.habitat/*.json` with SQLite-backed state reads or database assertions.
- [ ] Update cleanup helpers so temporary test directories remove `habitat.sqlite`.
- [ ] Add explicit coverage that unregister removes the database's local state and that no JSON fallback remains.
- [ ] Run `bun run typecheck` and `bun test`.

### Task 4: Perform the lab's command-line dependency check

**Files:**
- No source changes.

- [ ] Create an isolated temporary CLI state with the test or a controlled local database.
- [ ] Rename `habitat.sqlite` to `habitat.sqlite-old` and run `habitat status`.
- [ ] Confirm it reports missing local registration rather than showing old state.
- [ ] Restore the database and confirm `habitat status` works again.
- [ ] Inspect `git diff`, run all checks, and report exact results.
