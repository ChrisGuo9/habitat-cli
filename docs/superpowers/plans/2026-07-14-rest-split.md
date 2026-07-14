# Habitat REST Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Habitat CLI behind a full-proxy REST backend that owns SQLite, performs all Kepler calls, and preserves the current CLI behavior.

**Architecture:** Keep Commander.js as a thin client boundary. The standalone Hono backend owns SQLite, Kepler configuration and HTTP calls, and domain operations that combine remote and local state. Use mostly resource-shaped routes, with action-like routes only for domain transitions such as simulation ticks and construction cancellation.

**Tech Stack:** Bun, TypeScript, Commander.js, Hono, Bun SQLite, Bun test.

## Global Constraints

- The CLI must call the REST backend rather than opening SQLite or calling Kepler directly.
- The backend must own `habitat.sqlite` and all Kepler credentials/configuration.
- The server must be startable independently with `bun run server`.
- Hono app tests must run in memory without opening a real port.
- Preserve existing registration, catalog, solar, module, inventory, power, tick, and construction behavior.
- Keep the API mostly resource-shaped; use action-like routes for non-CRUD domain transitions.
- Do not remove the existing CLI surface until an equivalent backend path and smoke test exist.

---

### Checkpoint 1: Install Hono and create `GET /registration`

**Files:**
- Modify: `package.json` and `bun.lock` if Hono is not already declared.
- Create or modify: `src/api/server.ts`.
- Create or modify: `src/api/types.ts`.
- Test: `src/api/server.test.ts`.

**Work:** Define a reusable `createApi()` Hono application and add `GET /registration`. It should read the backend-owned registration state and return a stable JSON envelope such as `{ registration: ... }`, including `null` when no registration exists. Do not start a listener from the app factory.

**Proof:** An in-memory Hono request to `app.request("http://test/registration")` returns HTTP 200 and the expected JSON without opening a port.

- [ ] Add the dependency and lockfile entry.
- [ ] Add the app factory and route.
- [ ] Add the focused route test.
- [ ] Run `bun test src/api/server.test.ts`.

### Checkpoint 2: Test the Hono app entirely in memory

**Files:**
- Modify: `src/api/server.test.ts`.
- Modify: `src/api/server.ts` only if route construction needs a testable dependency boundary.

**Work:** Establish the reusable in-memory testing pattern for Hono requests. Test both the registered and unregistered responses using a temporary working directory or injected state boundary so the test does not depend on port `8787`, a running server, or external Kepler.

**Proof:** The test suite can exercise `GET /registration` and a controlled error response through `app.request()` while no TCP listener is created.

- [ ] Add an isolated state fixture.
- [ ] Add success and missing-state tests.
- [ ] Run the API test file and verify no server process is required.

### Checkpoint 3: Add the standalone server command

**Files:**
- Modify: `src/server.ts`.
- Modify: `package.json` only if the `server` script needs adjustment.
- Modify: `src/api/server.ts` to export a listener-free app factory and a separate start function.
- Test: `src/server.test.ts` or a focused server-start smoke check.

**Work:** Keep `createApi()` separate from `startServer()`. Make `bun run server` bind the configured host and port, defaulting to a development-safe localhost address and port. Do not have `src/index.ts` start the server automatically.

**Proof:** Starting `bun run server` produces a listening log, while importing/testing `createApi()` does not bind a port.

- [ ] Add the standalone start path.
- [ ] Add host/port environment handling.
- [ ] Test the app factory separately from the listener.
- [ ] Run `bun run server` manually and stop it after observing the log.

### Checkpoint 4: Create one focused CLI API client

**Files:**
- Create or consolidate: `src/api/client.ts`.
- Modify: `src/config.ts` if the backend base URL needs a dedicated setting.
- Test: `src/api/client.test.ts`.

**Work:** Define one small REST client boundary with a shared request helper, backend base URL resolution, JSON parsing, and consistent error conversion. Start with `getRegistration()`. The client must not import `bun:sqlite` or the direct Kepler client.

**Proof:** A mocked `fetch` call proves the client sends the expected method/path and converts non-2xx responses into a useful error.

- [ ] Define the backend URL configuration.
- [ ] Implement the shared request helper.
- [ ] Implement `getRegistration()`.
- [ ] Add request and error tests.

### Checkpoint 5: Move registration through the backend

**Files:**
- Modify: `src/api/server.ts` and `src/api/types.ts`.
- Modify: `src/api/client.ts`.
- Modify: `src/index.ts` registration/status/unregister handlers.
- Modify: `src/state.ts` only to clarify backend storage boundaries, if necessary.
- Test: `src/api/server.test.ts`, `src/api/client.test.ts`, and relevant cases in `src/index.test.ts`.

**Work:** Add resource-shaped registration endpoints:

```text
GET    /registration
POST   /registration
DELETE /registration
GET    /habitat/status
```

The backend performs the Kepler registration, hydrates starter modules/blueprints, and persists registration plus local state in SQLite. The CLI sends requests through the focused API client and only formats responses.

**Proof:** An in-memory backend test verifies registration causes the expected SQLite state and mocked Kepler call. A CLI test verifies `register`, `status`, and `unregister` work through HTTP without the CLI importing SQLite or Kepler.

- [ ] Add backend registration request/response types.
- [ ] Move registration orchestration behind the API.
- [ ] Replace direct CLI registration calls with client calls.
- [ ] Verify delete clears the backend-owned local state.

### Checkpoint 6: Move catalog and solar through the backend

**Files:**
- Modify: `src/api/server.ts`.
- Modify: `src/api/client.ts`.
- Modify: `src/commands/catalog.ts` and the solar handler in `src/index.ts`.
- Keep direct Kepler integration in: `src/kepler.ts`, now backend-only.
- Test: `src/api/server.test.ts`, `src/api/client.test.ts`, and catalog/solar cases in `src/index.test.ts`.

**Work:** Add:

```text
GET /catalog/blueprints
GET /catalog/blueprints/:id
GET /catalog/resources
GET /solar/irradiance
```

The backend calls Kepler and maps failures to stable API errors. The CLI requests these resources through `src/api/client.ts` and formats the returned data.

**Proof:** In-memory API tests mock Kepler and verify paths, response shapes, and failures. CLI tests prove catalog and solar commands no longer call Kepler directly.

- [ ] Add client methods for catalog and solar.
- [ ] Add backend proxy routes.
- [ ] Move command handlers to the client methods.
- [ ] Test missing blueprints and Kepler failures.

### Checkpoint 7: Move modules and inventory through the backend

**Files:**
- Modify: `src/api/server.ts` and `src/api/types.ts`.
- Modify: `src/api/client.ts`.
- Modify: `src/index.ts` and `src/commands/construction.ts`.
- Refine backend persistence in: `src/state.ts`.
- Test: `src/api/server.test.ts`, `src/api/client.test.ts`, `src/state.test.ts`, and module/inventory cases in `src/index.test.ts`.

**Work:** Add resource routes for module and inventory reads/mutations:

```text
GET    /modules
GET    /modules/:id
POST   /modules
PUT    /modules/:id
DELETE /modules/:id
GET    /inventory
PUT    /inventory
DELETE /inventory
```

The backend performs alias resolution, module CRUD, inventory updates, and SQLite writes. The CLI keeps only argument parsing and output formatting.

**Proof:** API tests verify each mutation changes backend SQLite state. CLI tests verify module and inventory commands work through REST and retain their current output and error behavior.

- [ ] Define resource request/response types.
- [ ] Add backend module and inventory routes.
- [ ] Add focused client methods.
- [ ] Move CLI handlers to those methods.
- [ ] Verify no client-side state or direct SQLite access remains.

### Checkpoint 8: Preserve power, tick, and construction behavior

**Files:**
- Modify: `src/api/server.ts`, `src/api/client.ts`, and `src/api/types.ts`.
- Move or adapt domain logic in: `src/simulation.ts`, `src/construction.ts`, and `src/module-status.ts` so the backend invokes it.
- Modify: `src/index.ts` tick and construction handlers.
- Test: `src/simulation.test.ts`, `src/state.test.ts`, `src/api/server.test.ts`, and relevant cases in `src/index.test.ts`.

**Work:** Add backend operations for non-CRUD transitions:

```text
POST /simulation/ticks
POST /construction-jobs
GET  /construction-jobs/current
POST /construction-jobs/:id/cancel
```

The backend loads SQLite state, calls Kepler for irradiance or blueprints when needed, runs the existing simulation/construction logic, and persists coordinated state changes. The CLI sends the operation request and prints the returned summary.

**Proof:** Existing unit tests continue to prove the pure simulation/construction rules. API tests prove a tick and construction operation update backend state. CLI tests prove the existing commands retain their behavior through REST.

- [ ] Define tick and construction API contracts.
- [ ] Move orchestration behind backend routes.
- [ ] Preserve the existing pure domain functions where practical.
- [ ] Add API-level transition tests.
- [ ] Verify power and construction state are persisted together.

### Checkpoint 9: Add sanitized Habitat API and Kepler logs

**Files:**
- Modify: `src/api/server.ts`.
- Modify: `src/kepler.ts`.
- Modify: `src/server.ts`.
- Test: `src/api/server.test.ts` and a focused logging test if logging is extracted into a helper.

**Work:** Add structured, sanitized logs for backend requests and Kepler calls. Logs may include method, path, status, duration, and high-level operation names. They must not include tokens, authorization headers, raw secrets, or sensitive request bodies. Keep Habitat API logs distinguishable from Kepler logs.

**Proof:** Tests capture log output and assert expected route/Kepler metadata is present while configured tokens and authorization headers are absent.

- [ ] Define the sanitized log format.
- [ ] Add Habitat API request logging.
- [ ] Add Kepler request/result logging.
- [ ] Add redaction tests.

### Checkpoint 10: Verify localhost and `0.0.0.0` listening

**Files:**
- Modify: `src/server.ts` only if host binding or startup output needs correction.
- Modify: documentation such as `README.md` if added later.
- Test: a shell-level server smoke check, not an in-memory unit test.

**Work:** Verify both development binding modes explicitly:

```bash
HABITAT_API_HOST=127.0.0.1 HABITAT_API_PORT=8787 bun run server
HABITAT_API_HOST=0.0.0.0 HABITAT_API_PORT=8787 bun run server
```

Confirm the server log reports the expected host/port and that `curl` can reach the appropriate endpoint. Stop each server cleanly after the check.

**Proof:** `curl http://127.0.0.1:8787/registration` succeeds for localhost mode, and the `0.0.0.0` mode reports a wildcard bind while remaining reachable through localhost on the development machine.

- [ ] Run the localhost bind check.
- [ ] Run the wildcard bind check.
- [ ] Record exact startup and curl results.

### Checkpoint 11: Run all tests and real CLI smoke tests

**Files:**
- Modify: only files required to correct failures discovered by verification.
- Test: all existing test files plus real shell commands.

**Work:** Run the complete verification set after the REST split:

```bash
bun run typecheck
bun test
```

With the standalone backend running, run real CLI smoke tests covering registration, status, catalog, solar, modules, inventory, construction, tick, and unregister. Confirm the CLI communicates with the backend and that `habitat.sqlite` is created/updated by the server rather than the CLI.

**Proof:** Typecheck and all tests pass. Smoke tests produce expected output, API/Kepler logs are sanitized, and SQLite inspection shows backend-owned state with no JSON persistence fallback.

- [ ] Run typecheck.
- [ ] Run the full test suite.
- [ ] Start the server separately.
- [ ] Run the real CLI smoke-test sequence.
- [ ] Inspect SQLite and confirm no `.habitat/*.json` files are used.
- [ ] Document exact commands and results.

## Final handoff

After all checkpoints pass, review the diff, confirm the CLI has no direct SQLite or Kepler imports, verify the backend owns those integrations, and update the project documentation with the server startup command, API base URL configuration, smoke-test sequence, and the resource/action route table.
