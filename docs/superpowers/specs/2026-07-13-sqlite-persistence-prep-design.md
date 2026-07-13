# SQLite Persistence Prep Design

## Goal

Move all local Habitat CLI state from separate JSON files into Bun's built-in SQLite support while keeping Kepler-owned server data remote and preserving the existing command behavior.

## Current boundary

Kepler owns registration responses, official blueprint and resource catalogs, unlocks, stream/replay URLs, and shared world data such as solar irradiance. The CLI owns the student's local registration metadata, hydrated starter modules and their mutable runtime state, simulation tick, inventory, and construction job.

## Recommended approach

Keep the public state functions in `src/state.ts` so command code does not need a broad rewrite. Replace the JSON helper implementation with a focused SQLite storage implementation using `import { Database } from "bun:sqlite"`.

The database path is `habitat.sqlite` in the caller's working directory. Opening the database creates it when needed and initializes this table:

```sql
CREATE TABLE IF NOT EXISTS habitat_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
```

Each existing state category maps to one key: `registration`, `modules`, `simulation`, `inventory`, and `construction`. Values are serialized JSON inside SQLite because the first migration is about ownership and persistence boundaries, not prematurely normalizing every nested game object. Writes use SQLite statements and transactions where a state update has multiple values.

The existing read functions return `null` when a key is absent. The existing `readOrCreate...` functions create their defaults in SQLite. Remove/unregister deletes keys from SQLite. No active code reads or writes the old `.habitat/*.json` files, and no fallback migration is added.

## Error behavior

Missing database state behaves like missing JSON state: commands that require registration or modules report the existing beginner-friendly error. A missing `habitat.sqlite` after it is renamed must therefore make `habitat status` report that no local registration exists rather than recovering from JSON.

## Verification

Run `bun run typecheck` and `bun test`. Add storage tests that prove state persists in `habitat.sqlite`, old JSON files are not created, and deleting/renaming the database removes access to the prior state. Run the lab's deliberate command-line check by renaming `habitat.sqlite`, running `habitat status`, restoring it, and running `habitat status` again.

## Out of scope

Do not replace Kepler API calls with local catalog tables, hard-code official blueprint data, or redesign the simulation schema. A future improvement can normalize modules, inventory, and construction into relational tables after this boundary is proven.
