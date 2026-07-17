# Habitat Crew, Exploration, Collection, and Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add registration-hydrated humans, local EVA state, saved-position scanning, authoritative Kepler collection, transactional docking, and persisted operational alerts to the existing Habitat CLI and Hono API.

**Architecture:** Extend the existing SQLite `habitat_state` adapter with focused human, exploration, and alert domain modules. The CLI calls only canonical Hono routes; Hono alone calls Kepler for sector bounds, scanning, and collection. Registration hydration and docking use explicit SQLite transactions.

**Tech Stack:** Bun, TypeScript, Commander, Hono, `bun:sqlite`, Bun test.

## Global Constraints

- The attached lab instructions and live Kepler OpenAPI contract are authoritative.
- Do not hard-code starter humans, module IDs, alert schemas, sector bounds, or Kepler resource truth.
- Do not add duplicate `/api/...` aliases.
- Never expose `KEPLER_PLANET_TOKEN` in client code, output, logs, fixtures, or commits.
- Keep command wiring in `src/index.ts`; domain behavior belongs in focused modules.
- Use test-first red-green-refactor for every behavior.
- Verify each checkpoint before starting the next checkpoint.

---

### Task 1: Registration contract types (Checkpoint 1)

**Files:**
- Modify: `src/kepler.ts`
- Modify: `src/state.ts`
- Test: `src/state.test.ts`

**Interfaces:**
- Produces: `KeplerStarterHuman`, `KeplerAlertContract`, `KeplerRegistrationContracts`, and complete `KeplerRegistrationResponse` fields.
- Produces: a persisted registration-contract representation usable by later alert work.

- [ ] **Step 1: Write failing contract/persistence tests**

Add a state test with live-shaped fixtures proving a human preserves `id`, `displayName`, and `locationModuleId`, and an alert contract preserves `schemaVersion` plus the full `schema` object.

- [ ] **Step 2: Verify RED**

Run `bun test src/state.test.ts`. Expect TypeScript/runtime failure because the human and contract types/state functions do not exist.

- [ ] **Step 3: Add minimal shared types and state accessors**

Model the OpenAPI fields without inventing concrete humans or schema values. Add read/write/remove accessors for the registration contract using the existing SQLite state pattern.

- [ ] **Step 4: Verify GREEN and existing status**

Run `bun test src/state.test.ts`, `bun run typecheck`, and with the local server active run `HABITAT_API_BASE_URL=http://127.0.0.1:8787 bun run src/index.ts status`. Expect tests/typecheck to pass and the existing habitat to remain registered with six modules.

- [ ] **Step 5: Commit**

Commit only Task 1 files with `git commit -m "Represent crew registration contracts"`.

### Task 2: Transactional registration hydration (Checkpoint 2)

**Files:**
- Modify: `src/state.ts`
- Modify: `src/api/server.ts`
- Modify: `src/api/types.ts`
- Modify: `src/remote-state.ts`
- Test: `src/state.test.ts`
- Test: `src/api/server.test.ts`

**Interfaces:**
- Produces: `HabitatHumanState`, `readHumanState`, `writeHumanState`, `removeHumanState`.
- Produces: one transaction function that atomically writes registration, modules, humans, and the alert contract.

- [ ] **Step 1: Back up existing local state**

Use `sqlite3 habitat.sqlite '.backup <timestamped-safe-path>'` and verify the backup opens before the lab-required unregister. Do not overwrite the current database.

- [ ] **Step 2: Write failing transaction tests**

Test successful hydration of six modules and two humans from the registration payload. Inject a failure between module and human writes and prove no registration, modules, humans, or contract remain.

- [ ] **Step 3: Verify RED**

Run the named state/API tests and confirm failure is caused by missing human hydration/transaction behavior.

- [ ] **Step 4: Implement one SQLite registration transaction**

Expose a state transaction boundary using one `Database.transaction`. Validate both arrays, then write all four state keys through transaction-scoped helpers. Extend unregister and remote-state shapes to clear/transport humans and contracts.

- [ ] **Step 5: Verify GREEN**

Run `bun test src/state.test.ts src/api/server.test.ts` and `bun run typecheck`.

- [ ] **Step 6: Perform and inspect the required fresh registration**

Run `habitat unregister`, then `habitat register --name "Amphoreous Crew Lab"` through the local API override. Capture a sanitized response that omits `apiToken`, inspect exactly six modules, exactly two `starterHumans`, their assigned module IDs, the suitport module capabilities/runtime status, and `contracts.alerts`. Run status and module list.

- [ ] **Step 7: Commit**

Commit with `git commit -m "Hydrate starter humans transactionally"`.

### Task 3: Human API and CLI listing (Checkpoint 3)

**Files:**
- Create: `src/humans.ts`
- Create: `src/commands/humans.ts`
- Modify: `src/api/client.ts`
- Modify: `src/api/server.ts`
- Modify: `src/index.ts`
- Test: `src/humans.test.ts`
- Test: `src/api/server.test.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces: `listHumans(cwd): KeplerStarterHuman[]`.
- Produces: `GET /humans`, `getHumans()`, and `habitat human list [--json]`.

- [ ] **Step 1: Write failing domain, route, and CLI tests**

Assert two persisted humans are returned once, readable output includes ID/name/module, JSON preserves objects, and repeated GET/list calls do not mutate or duplicate state.

- [ ] **Step 2: Verify RED**

Run the three named test files and confirm missing module/route/command failures.

- [ ] **Step 3: Implement focused listing behavior**

Read the sole persisted human state, add canonical `GET /humans`, add client function and focused Commander wiring, and register it from `src/index.ts`.

- [ ] **Step 4: Verify GREEN and checkpoint commands**

Run tests/typecheck, then run `habitat human list` twice and `habitat human list --json`; compare both humans and module IDs with the sanitized registration response and confirm no duplicates.

- [ ] **Step 5: Commit**

Commit with `git commit -m "List persisted habitat humans"`.

### Task 4: Internal human movement and module protection (Checkpoint 4)

**Files:**
- Modify: `src/humans.ts`
- Modify: `src/commands/humans.ts`
- Modify: `src/api/client.ts`
- Modify: `src/api/server.ts`
- Modify: `src/state.ts`
- Test: `src/humans.test.ts`
- Test: `src/api/server.test.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces: `moveHuman(humanId, moduleId, cwd)` and `moduleHasOccupants(moduleId, cwd)`.
- Produces: canonical human move route and `habitat human move <human-id> <module-id>`.

- [ ] **Step 1: Write failing validation tests**

Cover successful movement despite disconnected/inactive modules, missing human, missing destination, full `crewCapacity`, unchanged state after rejection, and occupied-module deletion rejection.

- [ ] **Step 2: Verify RED**

Run focused tests and confirm the missing movement/protection behavior causes failures.

- [ ] **Step 3: Implement capacity-aware movement**

Read `crewCapacity` from destination `runtimeAttributes`, count persisted occupants, reject invalid targets before writing, and make module deletion consult persisted humans.

- [ ] **Step 4: Add API/client/CLI wiring and verify GREEN**

Run focused tests/typecheck. Using real IDs from list commands, run one successful move, missing/full move attempts, occupied deletion, and a final human list; verify rejected actions preserve location.

- [ ] **Step 5: Commit**

Commit with `git commit -m "Move humans between habitat modules"`.

### Task 5: EVA deployment and grid movement (Checkpoint 5)

**Files:**
- Create: `src/exploration.ts`
- Create: `src/commands/eva.ts`
- Modify: `src/state.ts`
- Modify: `src/kepler.ts`
- Modify: `src/api/client.ts`
- Modify: `src/api/server.ts`
- Modify: `src/index.ts`
- Test: `src/exploration.test.ts`
- Test: `src/api/server.test.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces: `HabitatExplorationState` with nullable human/position, carried resources, and `maxCapacityKg`.
- Produces: `deployExplorer`, `moveExplorer`, and docking eligibility/state functions.
- Produces: typed `getCurrentWorldSector` Kepler call and canonical EVA routes/commands.

- [ ] **Step 1: Write failing state/domain tests**

Cover deployment only from the live active basic suitport, one explorer maximum, origin `(0,0)`, exact cardinal movement, rejection of diagonal/jump/out-of-sector/no-explorer actions, persistence after success, and no mutation after rejection.

- [ ] **Step 2: Verify RED**

Run exploration/API/CLI tests and confirm missing EVA behavior.

- [ ] **Step 3: Implement exploration domain and persistence**

Identify suitport from live module data, set a documented local carrying capacity, persist successful states, and accept live sector bounds as movement input.

- [ ] **Step 4: Add Kepler sector, API, client, and CLI wiring**

Hono fetches the registered habitat's current sector and passes its bounds to movement. Add status/deploy/move/dock endpoints without `/api` aliases and register focused commands.

- [ ] **Step 5: Verify GREEN and lab rejection sequence**

Run tests/typecheck. Move a real human to suitport, deploy, move to `(1,0)`, reject `(2,1)`, reject `(5,0)`, reject docking away from origin, verify state after every rejection, return to `(0,0)`, and remain deployed.

- [ ] **Step 6: Commit**

Commit with `git commit -m "Add persisted EVA exploration"`.

### Task 6: Saved-position scanning (Checkpoint 6)

**Files:**
- Modify: `src/commands/scan.ts`
- Modify: `src/api/client.ts`
- Modify: `src/api/server.ts`
- Test: `src/api/client.test.ts`
- Test: `src/api/server.test.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Changes: `scanWorldViaApi` accepts only strength/radius.
- Changes: Hono supplies registration ID and persisted explorer coordinates to `scanWorld`.

- [ ] **Step 1: Write failing scan tests**

Assert CLI rejects `--x/--y`, API ignores no caller position because none is accepted, saved `(1,0)` reaches Kepler, missing explorer returns a helpful 400, and backend strength/radius validation remains authoritative.

- [ ] **Step 2: Verify RED**

Run scan-related client/API/CLI tests and confirm failures reflect the old coordinate contract.

- [ ] **Step 3: Remove caller coordinates and read explorer state**

Update command/client query shapes and have Hono require active exploration state before calling Kepler with saved coordinates.

- [ ] **Step 4: Verify GREEN and live scan**

Run tests/typecheck, move the explorer to `(1,0)`, run `habitat scan --strength 100 --radius 0`, and confirm response origin `(1,0)`.

- [ ] **Step 5: Commit**

Commit with `git commit -m "Scan from the explorer position"`.

### Task 7: Authoritative collection (Checkpoint 7)

**Files:**
- Modify: `src/kepler.ts`
- Modify: `src/exploration.ts`
- Create: `src/commands/collect.ts`
- Modify: `src/api/client.ts`
- Modify: `src/api/server.ts`
- Modify: `src/index.ts`
- Test: `src/exploration.test.ts`
- Test: `src/api/server.test.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces: typed `collectWorldResource(config, {habitatId,x,y,quantityKg})`.
- Produces: local collect route/client and `habitat collect <quantity-kg>`.

- [ ] **Step 1: Write failing local-validation and ordering tests**

Cover no explorer, non-positive/fractional quantity, over-capacity request, Kepler empty/insufficient rejection, no local mutation on failure, and carried-resource addition only after Kepler success.

- [ ] **Step 2: Verify RED**

Run focused tests and confirm collection behavior is absent.

- [ ] **Step 3: Implement typed Kepler collection and local orchestration**

Validate local state first, call authenticated `/world/collect` only after validation, then add the returned resource/quantity to carried state. Never log request headers or token.

- [ ] **Step 4: Add route/client/CLI and verify GREEN**

Run tests/typecheck. Use saved-position scans to find material, collect `1`, inspect EVA status, reject a request larger than remaining capacity, then attempt an empty tile and verify carrying state stays unchanged after each rejection.

- [ ] **Step 5: Commit**

Commit with `git commit -m "Collect Kepler resources during EVA"`.

### Task 8: Transactional docking and inventory return (Checkpoint 8)

**Files:**
- Modify: `src/state.ts`
- Modify: `src/exploration.ts`
- Modify: `src/api/server.ts`
- Test: `src/exploration.test.ts`
- Test: `src/api/server.test.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces: one docking transaction that updates inventory, humans, and exploration state atomically.

- [ ] **Step 1: Write failing docking transaction tests**

Assert docking only at origin, exact one-time inventory transfer, empty carried state, human returned to suitport, cleared explorer/position, second dock rejection, and injected mid-transaction failure rolling back all state.

- [ ] **Step 2: Verify RED**

Run focused tests and confirm incomplete docking behavior.

- [ ] **Step 3: Implement atomic docking**

Use one SQLite transaction and transaction-scoped reads/writes for inventory, humans, and exploration. Do not expose partial state.

- [ ] **Step 4: Verify GREEN and checkpoint state sequence**

Run tests/typecheck. Record inventory, return one tile at a time, inspect EVA state, dock, then inspect inventory/humans/EVA; verify inventory increases exactly once and explorer is cleared.

- [ ] **Step 5: Verify post-dock scan rejection and commit**

Run scan with no deployed human and confirm helpful rejection. Commit with `git commit -m "Return EVA resources transactionally"`.

### Task 9: Persisted alert lifecycle (Checkpoint 9)

**Files:**
- Create: `src/alerts.ts`
- Create: `src/commands/alerts.ts`
- Modify: `src/state.ts`
- Modify: `src/exploration.ts`
- Modify: `src/api/client.ts`
- Modify: `src/api/server.ts`
- Modify: `src/index.ts`
- Test: `src/alerts.test.ts`
- Test: `src/api/server.test.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Produces: persisted alert record/state shaped by registered `contracts.alerts`.
- Produces: observe/deduplicate, acknowledge, and resolve functions.
- Produces: `GET /alerts`, acknowledgement route, and alert CLI commands.

- [ ] **Step 1: Write failing lifecycle tests**

Cover outside-human, capacity-reached, and post-validation collection-failure alerts; required contract fields; optional subject omission for habitat-wide alerts; repeated unresolved observation updates time/count; acknowledgement; and resolution after condition removal.

- [ ] **Step 2: Verify RED**

Run alert/domain/API/CLI tests and confirm alert behavior is missing.

- [ ] **Step 3: Implement focused persisted alerts**

Generate IDs/timestamps locally, validate required registered schema expectations, deduplicate by condition/source/subject while status is unresolved, and preserve `open`, `acknowledged`, and `resolved` states.

- [ ] **Step 4: Integrate alert observations transactionally where needed**

Deployment observes outside-human; full carrying observes capacity; locally valid Kepler collection failure observes collection-failure; docking resolves outside-human and capacity conditions in the docking transaction.

- [ ] **Step 5: Add API/client/CLI and verify GREEN**

Run tests/typecheck, deploy a human, repeat an alert condition, list alerts, acknowledge a real ID, list again, dock/remove the condition, and confirm resolution plus occurrence-count deduplication.

- [ ] **Step 6: Commit**

Commit with `git commit -m "Persist habitat operational alerts"`.

### Task 10: Complete mission and delivery (Checkpoint 10)

**Files:**
- Modify only files needed for requirements gaps found by review.
- Test: all test files.

**Interfaces:**
- Produces: verified complete lab behavior and final repository tag.

- [ ] **Step 1: Audit every lab requirement against code and tests**

Use a checklist covering all checkpoints, canonical routes, ownership, transactions, security, readable/JSON output, and rejected-action immutability. For any gap, add a failing test before its fix.

- [ ] **Step 2: Run automated verification**

Run `bun run typecheck`, `bun test`, and `git diff --check`. All must pass with no unexpected warnings or failures.

- [ ] **Step 3: Run one complete live CLI mission**

Through the local Hono API: list humans; move one to suitport; deploy; run valid and rejected moves; scan one tile at a time until material is found; collect; verify carried state; return cardinally; verify pre-dock inventory; dock; verify inventory/human/EVA state; list and acknowledge a mission alert. Inspect output after every command.

- [ ] **Step 4: Commit remaining verified changes**

If the audit produced changes, commit them with `git commit -m "Complete crew exploration mission"`. Confirm `git status --short` is empty.

- [ ] **Step 5: Create final tag and report deliverables**

Create `habitat-crew-exploration-collection-alerts` on the verified final commit and show the public GitHub URL. Provide the submission note: docking is transactional so inventory transfer, carried-resource clearing, human return, and explorer clearing either all occur once or none occur. Remind the student to record the required explanatory video; do not claim the video exists.
