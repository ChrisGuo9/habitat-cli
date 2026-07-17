# Kepler Live Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Habitat backend to Kepler's authenticated live tick stream while preserving a durable manual mode and the existing local REST, SQLite, and simulation architecture.

**Architecture:** Store returned stream credentials only in registration state and store durable mode plus safe connection/message observations in a separate clock state. A focused backend clock controller owns the sole WebSocket, feeds validated advances into the same serialized simulation operation as manual ticks, and publishes safe future-only events to local SSE clients.

**Tech Stack:** Bun 1.3, TypeScript 5.9, Hono 4, Commander 15, `bun:sqlite`, Bun WebSocket client, Server-Sent Events, `bun:test`.

## Global Constraints

- Continue in the existing `/Users/chris/Documents/labs/habitat-cli` repository.
- Preserve the existing local REST and SQLite architecture and all existing Habitat state.
- The long-running Hono backend owns exactly one authenticated Kepler WebSocket.
- The CLI and dashboard communicate only with the local Habitat API.
- Registration defaults to manual mode with listening off.
- The stream API token has one authoritative persisted copy and never appears in logs or SSE events.
- Manual ticks are allowed only in manual mode.
- Live notices apply the complete positive whole-number `advancedBy` exactly once.
- Duplicate, older, and missed notices are not replayed or caught up.
- Use Bun commands and follow red-green-refactor for every behavior change.

---

### Task 1: Persist the Full Registration and Clock State

**Files:**
- Modify: `src/kepler.ts`
- Modify: `src/state.ts`
- Test: `src/state.test.ts`

**Interfaces:**
- Produces: `KeplerStreamMetadata`, expanded `KeplerRegistrationResponse`, expanded `HabitatRegistration`, `HabitatClockState`, `defaultClockState()`, `readClockState()`, `writeClockState()`, and `removeClockState()`.

- [ ] **Step 1: Write failing persistence tests**

Add tests that save and reload a registration containing `streamUrl`, `apiToken`, and all stream metadata; save and reload both manual and Kepler clock states; verify a missing clock record resolves to the manual default; and verify clock removal does not affect other state.

```ts
expect(readRegistration(cwd)).toMatchObject({
  streamUrl: "wss://planet.turingguild.com/planet/stream",
  apiToken: "habitat-stream-secret",
  stream: { protocolVersion: "1.0", subscriptions: ["ticks"], currentTick: 800,
    tickIntervalMs: 5000, ticksPerPulse: 1, status: "running" },
});
expect(readClockState(cwd)).toEqual(defaultClockState());
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test src/state.test.ts`

Expected: failure because clock helpers and stream fields do not exist.

- [ ] **Step 3: Implement minimal types and state helpers**

Use the existing `habitat_state` table and keys `registration` and `clock`. Keep backward compatibility by returning `defaultClockState()` when the `clock` key is absent.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `bun test src/state.test.ts && bun run typecheck`

Expected: all focused tests pass and TypeScript exits 0.

### Task 2: Capture Registration Credentials and Default Manual Mode

**Files:**
- Modify: `src/api/server.ts`
- Modify: `src/api/types.ts`
- Test: `src/api/server.test.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Consumes: Task 1 registration and clock helpers.
- Produces: registration POST that reuses an existing UUID, saves the full stream response, creates manual clock state, and registration GET that returns all locally saved stream fields.

- [ ] **Step 1: Write failing registration route tests**

Inject `registerHabitat` into `createApi` dependencies. Assert a first registration sends a UUID and persists all stream fields, while a legacy refresh sends the already saved UUID. Assert registration initializes:

```ts
expect(readClockState(cwd)).toMatchObject({ mode: "manual", connectionState: "disconnected" });
```

Assert safe logger output never contains either configured registration credentials or returned stream token.

- [ ] **Step 2: Run route tests and verify RED**

Run: `bun test src/api/server.test.ts -t registration`

Expected: failure because the route drops stream fields and always creates a UUID.

- [ ] **Step 3: Implement registration persistence**

Use `readRegistration(cwd)?.habitatUuid ?? crypto.randomUUID()`. Persist the response stream values and call `writeClockState(defaultClockState(), cwd)` only after registration succeeds. Preserve existing module hydration.

- [ ] **Step 4: Update the CLI test Kepler fixture**

Make the fake registration response match the live required schema, including `streamUrl`, `apiToken`, `stream`, `contracts`, and `starterHumans`.

- [ ] **Step 5: Verify focused and full baseline tests**

Run: `bun test src/api/server.test.ts src/index.test.ts && bun run typecheck`

Expected: tests pass with no credential in captured logs.

### Task 3: Add the Shared Serialized Tick Operation and Manual Lock

**Files:**
- Create: `src/tick-service.ts`
- Create: `src/tick-service.test.ts`
- Modify: `src/api/server.ts`
- Test: `src/api/server.test.ts`

**Interfaces:**
- Produces: `createTickService({ cwd, getSolarIrradiance, loadConfig })` with `runManual(count)` and `runKepler(input)` methods and serialized mode/tick transitions.
- `runKepler` consumes `{ tick, previousTick, advancedBy, issuedAt }` and returns `{ applied, result }`.

- [ ] **Step 1: Write failing service tests**

Cover manual success in manual mode, manual rejection in Kepler mode, `advancedBy: 100` passed unchanged to simulation, duplicate/older absolute tick ignored, and no state mutation when solar lookup fails.

```ts
await expect(service.runManual(1)).rejects.toThrow(
  "Manual ticks are disabled while listening to Kepler. Run `habitat clock listen off`",
);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test src/tick-service.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the minimal serialized service**

Use a private promise chain as a mutex. Read authoritative state inside the queued operation. Call the existing `runSimulationTicks` exactly once per accepted request and persist module, simulation, and construction results. Update `lastKeplerTick`, `lastAdvancedBy`, and `lastMessageAt` only for an accepted Kepler notice.

- [ ] **Step 4: Route manual ticks through the service**

Inject or construct one service per backend and replace the inline `/ticks` simulation logic with `runManual(count)`.

- [ ] **Step 5: Verify focused routes and service**

Run: `bun test src/tick-service.test.ts src/api/server.test.ts && bun run typecheck`

Expected: focused tests pass and existing `/ticks` response remains compatible.

### Task 4: Build and Test the Focused WebSocket Controller

**Files:**
- Create: `src/clock-client.ts`
- Create: `src/clock-client.test.ts`

**Interfaces:**
- Consumes: registration/clock state helpers and `tickService.runKepler()`.
- Produces: `KeplerClockController` with `start()`, `listenOn()`, `listenOff()`, `status()`, `subscribe(listener)`, and `shutdown()`.
- Produces safe `ClockTickEvent` objects containing only `tick`, `previousTick`, `advancedBy`, `issuedAt`, and `applied`.

- [ ] **Step 1: Write a fake WebSocket harness and failing tests**

Test URL contains no token; the first message is the exact hello; advertised subscriptions are intersected with `ticks`; ticks before `hello_ack` are ignored; wrong Habitat acknowledgement becomes an error; malformed JSON and invalid `advancedBy` do not mutate state; valid 1, 10, and 100 advances apply fully; duplicates are ignored; unexpected close schedules reconnect; listen-off and shutdown cancel reconnect and close cleanly.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test src/clock-client.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement protocol parsers and controller state machine**

Keep parsing functions small and named. Never interpolate the token into errors. Do not send `lastAppliedPlanetTick`. Set Kepler mode before `connect()`. During `listenOff()`, stop reconnecting, close the socket, await queued tick work, then save manual mode.

- [ ] **Step 4: Emit future-only safe events**

Notify only currently subscribed local listeners after a valid notice has been evaluated. Include `applied: false` for duplicates received during the active connection, without replaying stored history to new listeners.

- [ ] **Step 5: Verify controller tests and typecheck**

Run: `bun test src/clock-client.test.ts && bun run typecheck`

Expected: controller tests pass and TypeScript exits 0.

### Task 5: Add Clock Routes, SSE, and Backend Lifecycle Ownership

**Files:**
- Modify: `src/api/server.ts`
- Modify: `src/server.ts`
- Modify: `src/api/types.ts`
- Test: `src/api/server.test.ts`

**Interfaces:**
- Consumes: one injected or server-created `KeplerClockController`.
- Produces: `GET /clock/status`, `POST /clock/listen`, `GET /clock/events`, and backend startup/shutdown controller lifecycle.

- [ ] **Step 1: Write failing route tests**

Assert status defaults to manual/off/allowed; listen-on calls the controller after saving Kepler mode; listen-off returns manual mode; unavailable credentials return an actionable 400; SSE headers are correct; a connected SSE reader sees only future safe events; cancelling the reader unsubscribes without stopping the controller.

- [ ] **Step 2: Run route tests and verify RED**

Run: `bun test src/api/server.test.ts -t clock`

Expected: 404 responses for missing routes.

- [ ] **Step 3: Implement routes and SSE stream**

Use Hono's streaming response or a `ReadableStream` with `text/event-stream`, `no-cache`, and keep-alive headers. Encode each event as one `event: planet_tick` and one JSON `data:` record.

- [ ] **Step 4: Wire one controller into `startServer()`**

Create the tick service and controller once, pass the controller into `createApi`, start it when persisted mode is Kepler, and register SIGINT/SIGTERM cleanup that awaits `shutdown()` before stopping the Bun server.

- [ ] **Step 5: Verify API, lifecycle, and typecheck**

Run: `bun test src/api/server.test.ts && bun run typecheck`

Expected: clock route tests and all existing API tests pass.

### Task 6: Add Local API Client and CLI Clock Commands

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/api/client.test.ts`
- Create: `src/commands/clock.ts`
- Modify: `src/index.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces: `getClockStatus()`, `setClockListening(listening)`, and `watchClockEvents(onEvent, signal)` local API helpers.
- Produces Commander command group `clock status`, `clock listen on|off`, and `clock watch`.

- [ ] **Step 1: Write failing API-client tests**

Assert exact local paths/methods and incremental parsing of SSE records split across chunks. Assert abort closes only the local fetch.

- [ ] **Step 2: Run client tests and verify RED**

Run: `bun test src/api/client.test.ts`

Expected: missing clock helper failures.

- [ ] **Step 3: Implement local API helpers**

Parse the SSE body incrementally using `response.body.getReader()` and a `TextDecoder`. Accept only `planet_tick` events with JSON data and pass stable `ClockTickEvent` objects to the callback.

- [ ] **Step 4: Write failing CLI tests**

Test human output for manual and Kepler states, listen commands, watch output, and helpful manual-tick rejection. Test stable JSON for status and JSONL for watch without exposing a token in clock output.

- [ ] **Step 5: Implement focused CLI command wiring**

Keep rendering and command registration in `src/commands/clock.ts`; add only orchestration calls to `src/index.ts`. Output watch lines containing absolute tick, `advancedBy`, `issuedAt`, and `applied`.

- [ ] **Step 6: Verify CLI and API client**

Run: `bun test src/api/client.test.ts src/index.test.ts && bun run typecheck`

Expected: focused tests pass and `habitat --help` lists `clock`.

### Task 7: Registration Status JSON and Credential Visibility

**Files:**
- Modify: `src/index.ts`
- Modify: `src/commands/clock.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces stable `--json` status objects and `--jsonl` watch records while preserving current text output.

- [ ] **Step 1: Write failing status-output tests**

Assert text `habitat status` prints the full saved `streamUrl`, full `apiToken`, subscriptions, protocol version, current tick, interval, ticks per pulse, and status. Assert `habitat --json status` produces valid JSON with the same stable fields and no extra prose.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test src/index.test.ts -t "stream|JSON"`

Expected: missing fields/options.

- [ ] **Step 3: Implement global output modes**

Add global `--json` and `--jsonl` options. Centralize output-mode lookup and ensure status operations emit exactly one JSON document. The explicit registration status output may reveal the token; logs, clock status, and clock events may not.

- [ ] **Step 4: Verify CLI behavior**

Run: `bun test src/index.test.ts && bun run typecheck`

Expected: CLI suite passes with both human and machine-readable behavior.

### Task 8: Full Review, Live Verification, Commit, and Push

**Files:**
- Modify if needed: `DEPLOYMENT.md`
- Modify if needed: `written_summary.md`

**Interfaces:**
- Produces verified repository, service evidence, final manual mode, exact requested commit, tag-preserving push, and public URL.

- [ ] **Step 1: Run static and automated verification**

Run:

```bash
bun run typecheck
bun test
bun run build:web
git diff --check
```

Expected: zero failures, successful web build, and no whitespace errors.

- [ ] **Step 2: Audit every lab requirement and secrets boundary**

Run focused `rg` searches for `apiToken`, WebSocket construction, `/clock` routes, CLI commands, and log calls. Confirm the token has one state location and no logger interpolates it. Inspect `git diff` and `git status`.

- [ ] **Step 3: Exercise manual mode through the CLI**

Start the backend, then run `habitat clock status`, `habitat tick 1`, and `habitat tick 60`. Confirm manual/off/allowed and successful ticks.

- [ ] **Step 4: Exercise Kepler mode and watch**

Run `habitat clock listen on`, `habitat clock status`, and a separate `habitat clock watch`. Confirm authenticated connection, one future tick with absolute tick and full `advancedBy`, resulting simulation advancement, no token in output or journal, and rejected `habitat tick 1`.

- [ ] **Step 5: Exercise both restart modes**

Verify manual mode survives a service restart. Enable Kepler mode, restart, confirm automatic reconnect with no catch-up, then return to `habitat clock listen off` and confirm a manual tick succeeds.

- [ ] **Step 6: Review against the lab and fix any gaps test-first**

Re-read the lab success criteria and required deliverables line by line. For each gap, add a failing regression test, verify RED, implement the fix, and verify GREEN.

- [ ] **Step 7: Run final verification immediately before commit**

Run: `bun run typecheck && bun test && bun run build:web && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 8: Commit and push**

Run:

```bash
git add .
git commit -m "Connect Habitat to the Kepler live clock"
git push origin main
```

Expected: push succeeds to the existing public repository. Report its HTTPS URL and leave the saved clock mode manual.
