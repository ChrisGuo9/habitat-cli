# Habitat Resource Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested `habitat scan` command that proxies saved-registration resource scans through the local Habitat API and renders single-tile, radius-summary, and JSON output.

**Architecture:** Keep Commander as presentation-only wiring. Add typed scan transport to the existing API client, registration-aware validation and proxying to the Hono backend, and a focused Kepler integration using the shared request helper.

**Tech Stack:** Bun, TypeScript, Commander, Hono, Bun test

## Global Constraints

- Use `Habitat CLI -> local Habitat API -> Kepler World`.
- Never accept `habitatId` or a Kepler token from the scan command.
- Never persist hidden resource truth, remaining quantity, or scan responses locally.
- Validate integer x/y, strength 0-100, and radius 0-5.
- Preserve Kepler's complete response for `--json`.

---

### Task 1: Kepler scan integration and local API route

**Files:**
- Modify: `src/kepler.ts`
- Modify: `src/api/server.ts`
- Test: `src/api/server.test.ts`

**Interfaces:**
- Produces: `scanWorld(config, { habitatId, x, y, sensorStrength, radiusTiles }): Promise<WorldScanResponse>`
- Produces: `GET /world/scan?x=&y=&sensorStrength=&radiusTiles=`

- [ ] Add a failing in-memory API test that persists `habitat-123`, calls `/world/scan`, and asserts the injected upstream input and unchanged response.
- [ ] Run `bun test src/api/server.test.ts` and confirm the missing route/dependency failure.
- [ ] Add schema-aligned scan types and `scanWorld` using `keplerRequest` with encoded query parameters.
- [ ] Add injectable `scanWorld`, integer/range parsing, missing-registration handling, and the read-only Hono route.
- [ ] Add failing cases for missing registration, invalid coordinates, strength 101, and radius 6; make them return clear 400 responses without calling Kepler.
- [ ] Run `bun test src/api/server.test.ts` and confirm all API tests pass.

### Task 2: Typed local API client

**Files:**
- Modify: `src/api/client.ts`
- Test: `src/api/client.test.ts`

**Interfaces:**
- Consumes: `WorldScanResponse`
- Produces: `scanWorldViaApi({ x, y, sensorStrength, radiusTiles }): Promise<WorldScanResponse>`

- [ ] Add a failing client test that records the requested URL and verifies all four encoded scan query values.
- [ ] Run `bun test src/api/client.test.ts` and confirm `scanWorldViaApi` is missing.
- [ ] Implement the helper through `apiRequest` without adding `habitatId`.
- [ ] Run `bun test src/api/client.test.ts` and confirm the client tests pass.

### Task 3: CLI command and formatters

**Files:**
- Create: `src/commands/scan.ts`
- Modify: `src/index.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces: `registerScanCommand(program: Command): void`
- Produces: exported parsing and formatting helpers for focused unit behavior where useful.

- [ ] Extend the test Kepler server with `/world/scan` responses for probabilistic, exact, radius, and null-quantity cases.
- [ ] Add failing CLI tests for help/options, single-tile full probabilities, exact quantities, radius rows, JSON preservation, and invalid strength/radius.
- [ ] Run the focused scan tests and confirm failure because the command is absent.
- [ ] Implement strict integer/range parsing, quantity formatting, single-tile details, radius table output, and JSON output in `src/commands/scan.ts`.
- [ ] Register the focused command from `src/index.ts`.
- [ ] Run the focused tests until they pass, then run `bun test src/index.test.ts`.

### Task 4: Full and live verification

**Files:**
- Create: `scan-output.json` only if it contains no credentials or local secrets

- [ ] Run `bun run typecheck` and fix any type errors.
- [ ] Run `bun test` and fix regressions.
- [ ] Start the local API and verify `habitat status`.
- [ ] Run strength 60, strength 100, radius 1, radius 1 JSON, strength 101, and radius 6 commands sequentially.
- [ ] Check probability totals, exact quantity equality, probabilistic ranges, JSON field preservation, and absence of stack traces.
- [ ] Save one representative JSON response containing `quantityEstimate` if safe.

### Task 5: Review and submission

**Files:**
- Review all changed source, tests, docs, and evidence files.

- [ ] Confirm the CLI imports no direct Kepler or SQLite scan dependency and no scan state is stored locally.
- [ ] Run final `bun run typecheck`, `bun test`, and `git diff --check`.
- [ ] Stage safe changes and commit with `Add Habitat resource scanning`.
- [ ] Push the current branch to the public GitHub repository and verify the URL.
- [ ] Provide the public URL, JSON evidence path, exact demo commands, and a short user-recorded video script.
