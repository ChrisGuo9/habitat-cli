# Habitat Crew, Exploration, Collection, and Alerts Design

## Goal

Extend the existing Bun, TypeScript, Hono, and SQLite Habitat application so registration hydrates starter humans, one human can perform an EVA mission, scans originate from the saved explorer position, collected Kepler resources can be returned to local inventory, and operational alerts persist with the registered lifecycle contract.

The attached lab instructions are the controlling requirements. Existing commands and behavior remain compatible except where the lab explicitly changes them, especially removal of caller-supplied scan coordinates.

## Ownership and data flow

The Habitat backend owns local humans, human module locations, the deployed explorer, explorer coordinates, carrying capacity, carried resources, returned inventory, and alert records. These values persist in the existing SQLite database.

Kepler owns the current sector boundary and authoritative tile resource type and quantity. The Hono backend obtains the current sector, scans tiles, and collects resources through Kepler's live contract. The CLI never calls Kepler and never receives the Kepler token; it calls only the local Hono API.

The live registration response is the source of truth for starter modules, `starterHumans`, and `contracts.alerts`. No starter IDs, names, locations, suitport IDs, alert schema, sector bounds, or resource results are hard-coded. Because Kepler correctly rejects replaying the existing registered UUID and the older client discarded the extra response fields, the current OpenAPI schema supplies Checkpoint 1's types; the lab's required fresh registration in Checkpoint 2 supplies the concrete two humans, module capabilities, and alert schema that are then inspected and persisted.

## Local state and focused modules

- `src/humans.ts` owns human state operations, module-capacity validation, movement, and occupied-module checks.
- `src/exploration.ts` owns deployment, cardinal movement, docking eligibility, carrying capacity, and carried resources.
- `src/alerts.ts` owns alert creation, unresolved-condition deduplication, acknowledgement, and resolution.
- `src/state.ts` remains the SQLite adapter. It exposes reads and writes for the new state keys plus transaction helpers used by registration and docking.
- `src/kepler.ts` contains only typed Kepler contracts and client calls, including current-sector lookup and collection.
- `src/api/server.ts` wires canonical local routes to focused domain functions. It does not add `/api/...` aliases.
- Focused files under `src/commands/` provide human, EVA, collection, and alert CLI presentation and wiring. `src/index.ts` only registers those commands.

Humans are stored once and exposed from that persisted source. Exploration state stores either no active explorer or one deployed human with integer coordinates, a maximum capacity in kilograms, and carried quantities keyed by resource type. Alerts persist the fields required by the live registered alert JSON schema rather than a separate invented contract.

## Registration and transactions

Registration validates the full live payload and writes registration, six starter modules, two starter humans, and the alert contract in one SQLite transaction. Any failure rolls back the complete local registration. Unregister clears all local registration-related state, including humans, exploration, and alerts.

Docking at `(0, 0)` transfers every carried quantity into inventory, clears carried state, returns the human to the active basic suitport, clears the deployed explorer and position, and resolves the outside-habitat condition in one SQLite transaction. A failure rolls back all docking changes, preventing duplicate inventory transfers.

## Human behavior

`GET /humans`, `habitat human list`, and `habitat human move <human-id> <module-id>` operate on persisted humans. A move succeeds when the human and destination exist and the destination has unused `crewCapacity`; module connections and activity state do not affect movement. Missing humans, missing modules, and full destinations are rejected without mutation. Module deletion is rejected while any human occupies it.

Human CLI output is readable by default and preserves the project's `--json` convention. Repeated reads never hydrate or duplicate humans.

## EVA behavior

Only one human may be deployed. Deployment requires that human to occupy the active starter basic suitport identified from the live module's blueprint, capabilities, and runtime status rather than from a copied module ID. Deployment starts at `(0, 0)`.

Each successful move changes exactly one coordinate by one while the other coordinate remains unchanged. Diagonal movement, jumps, movement without an explorer, and coordinates outside the live current-sector bounds are rejected without mutation. Docking is allowed only at `(0, 0)`.

Canonical local endpoints support EVA status, deploy, move, and dock. CLI commands are exactly `habitat eva status`, `habitat eva deploy <human-id>`, `habitat eva move <x> <y>`, and `habitat eva dock`.

## Scanning and collection

`habitat scan --strength <0-100> --radius <0-5>` sends no position. The backend requires a deployed explorer, reads the saved coordinates, validates strength and radius, and supplies the saved habitat ID and position to Kepler. The CLI no longer accepts `--x` or `--y`.

`habitat collect <quantity-kg>` accepts positive whole kilograms only. Before calling Kepler, the backend requires a deployed explorer and verifies that the requested quantity fits within remaining capacity. It then calls authenticated `POST /world/collect` with the saved habitat ID and coordinates. Carried state changes only after Kepler succeeds, using Kepler's returned resource type and collected quantity. Kepler failures leave carrying state unchanged and produce or update the collection-failure alert after local validation has passed.

## Alerts

The alert system uses `contracts.alerts` saved from registration as its shared definition. At minimum it records:

- a human deployed outside the habitat;
- carried material reaching maximum capacity; and
- a Kepler collection failure after local validation succeeds.

Each alert follows the registered schema, including identifier, severity, status, source, timestamps, occurrence count, and optional human or module subject. Re-observing the same unresolved condition updates its last-observed timestamp and occurrence count instead of inserting a duplicate. Supported states are `open`, `acknowledged`, and `resolved`; removing a condition resolves the matching unresolved alert.

`GET /alerts`, `habitat alert list`, and `habitat alert acknowledge <alert-id>` expose this state. Push notifications are out of scope.

## Error handling

Local validation returns clear 4xx errors and performs no state mutation. Kepler or network failures return an appropriate gateway error, never expose credentials, and preserve local state except for the required collection-failure alert. CLI commands print the backend message without a stack trace and exit nonzero.

## Verification

Every behavior is implemented test-first with Bun tests at domain, API, client, and CLI levels. Each checkpoint is verified independently before proceeding. Final verification runs `bun run typecheck`, `bun test`, and a complete CLI mission against the local Hono API, including successful and rejected operations. The final repository is committed and tagged `habitat-crew-exploration-collection-alerts` only after all verification passes.

The student still needs to record and submit the required explanatory video; Codex cannot produce that personal demonstration on the student's behalf.
