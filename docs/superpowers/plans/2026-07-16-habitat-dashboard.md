# Habitat Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine and verify the existing React dashboard so it operates entirely through the Hono REST API and covers the manual Habitat deployment lab workflows.

**Architecture:** Keep the existing `web/src/api.ts` API client as the only browser data boundary and `web/src/main.tsx` as the dashboard coordinator. Improve presentation and states in `web/src/styles.css` and the React view without adding backend routes or browser-side simulation rules.

**Tech Stack:** React 19, TypeScript, Vite, Bun, Hono REST API.

## Global Constraints

- Use the existing `/state`, `/registration`, `/modules/:id`, and `/ticks` routes.
- Do not read SQLite or call Kepler directly from browser code.
- Support readable light and dark modes.
- Keep unregistering destructive and confirmation-gated.
- Do not add construction, inventory, crew, or other later features.

### Task 1: Audit current dashboard contract

**Files:**
- Inspect: `src/api/server.ts`, `web/src/api.ts`, `web/src/main.tsx`, `web/src/styles.css`
- Test: `web/src/api.test.ts`

- [ ] Confirm request and response shapes against route definitions.
- [ ] Identify only requirement gaps that affect the dashboard.
- [ ] Run `bun test web/src/api.test.ts` and `bun run typecheck` before edits.

### Task 2: Refine dashboard states and visual behavior

**Files:**
- Modify: `web/src/main.tsx`
- Modify: `web/src/styles.css`
- Test: `web/src/api.test.ts` if API-client behavior needs coverage

- [ ] Preserve API-only state access and existing controls.
- [ ] Add clear loading, empty, API-error, and post-action refresh behavior.
- [ ] Keep power metrics understandable before the first tick.
- [ ] Make module status and power values readable in both themes and narrow layouts.
- [ ] Keep unregister separate from normal actions and confirmation-based.

### Task 3: Verify production integration

**Files:**
- Modify: `web/index.html` only if the final document shell requires it.
- Generate: `dist/web/**`

- [ ] Run `bun test` and `bun run typecheck`.
- [ ] Run `bun run web:build`.
- [ ] Start `bun run server`, confirm the built dashboard loads on port 8787, and stop it cleanly.
- [ ] Verify no browser source imports SQLite, Kepler, or server-only state modules.

### Task 4: Provide operator verification commands

- [ ] Start the backend and development frontend in separate terminals.
- [ ] Verify registration, module offline/online changes, preset ticks, and custom ticks in the browser.
- [ ] After a browser module change, run `habitat module status` and `habitat power status`.
- [ ] Change a module with the CLI, refresh the browser, and confirm the same state.
- [ ] Report exact commands and any limitations without committing unrelated working-tree files.
