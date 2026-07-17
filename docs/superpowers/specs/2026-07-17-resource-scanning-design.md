# Habitat Resource Scanning Design

## Goal

Add a read-only `habitat scan` command that sends the Habitat operator's position and effective sensor strength through the local Habitat API to Kepler, then renders resource probabilities and quantity estimates without exposing a Habitat ID or Kepler token in the command.

## Architecture and ownership

The request path remains:

```text
Habitat CLI -> local Habitat API -> Kepler World
```

The CLI owns command parsing and presentation. It calls only the local Habitat API through the existing client boundary in `src/api/client.ts`.

The local Hono API owns registration lookup, validation at the service boundary, Kepler configuration, and the upstream request. It reads the saved registration from SQLite and adds `habitatId`; it does not accept `habitatId` from the CLI.

Kepler owns hidden resource truth, remaining quantity, the probability model, and scan results. No resource truth or remaining quantity is persisted locally. The Habitat supplies only the operator position, effective sensor strength, and radius.

## Components

### Kepler integration

`src/kepler.ts` defines the live `WorldScanResponse` types and a `scanWorld` function. The function reuses the existing authenticated `keplerRequest` helper and sends `GET /world/scan` with these query parameters:

- `habitatId`: saved registration ID supplied by the local API
- `x`: integer operator x coordinate
- `y`: integer operator y coordinate
- `sensorStrength`: integer from 0 through 100
- `radiusTiles`: integer from 0 through 5

The response is returned without transformation.

### Local Habitat API

`src/api/server.ts` exposes `GET /world/scan`. It validates required query values before calling Kepler. Coordinates must be integers, sensor strength must be an integer from 0 through 100, and radius must be an integer from 0 through 5.

The route reads the saved registration. When none exists, it returns a clear client error instructing the operator to register first. For valid requests it adds the saved `habitatId`, calls `scanWorld`, and returns the complete Kepler response unchanged. Upstream failures use the API's existing sanitized error and logging patterns.

### API client

`src/api/client.ts` adds a typed `scanWorldViaApi` helper. It sends only `x`, `y`, `sensorStrength`, and `radiusTiles` to the local route. Transport and URL construction remain outside Commander command wiring.

### CLI command and rendering

`src/commands/scan.ts` registers this command:

```text
habitat scan --x <integer> --y <integer> --strength <0-100> [--radius <0-5>] [--json]
```

`--x`, `--y`, and `--strength` are required. `--radius` defaults to `0`. CLI parsing rejects missing, non-integer, or out-of-range values before sending a request and prints a concise validation message without a stack trace.

With `--json`, the CLI prints the complete local API response as indented JSON without altering fields.

For a single-tile scan, normal output includes the origin, sensor strength, radius, terrain, distance, every returned resource probability (including the nullable resource candidate representing `none`), the top candidate and confidence, and the complete quantity estimate. A null quantity estimate is displayed as empty or unavailable and never invents kilograms.

For a radius greater than zero, normal output prints one summary row per returned tile with coordinates, distance, terrain, top candidate, confidence, and estimated quantity. Exact quantities are labeled exact; probabilistic quantities show the estimate and minimum-to-maximum range; null estimates remain empty.

## Error handling

Validation occurs in both the CLI and local API because the CLI provides immediate operator feedback while the API remains safe for other callers. Validation messages identify the invalid option and its accepted range. Missing registration is reported before any upstream call. Kepler and connection errors flow through the existing API/client error wrappers and contain no token or authorization data.

## Testing and verification

Development follows test-driven cycles:

1. Kepler integration tests verify the exact `/world/scan` query and unchanged response shape.
2. In-memory Hono tests verify saved `habitatId` injection, validation, missing registration, upstream forwarding, and no local scan persistence.
3. API client tests verify query construction and response preservation.
4. CLI tests verify help, single-tile probability output, radius summary output, JSON output, null and exact quantity formatting, and invalid-input errors.
5. `bun run typecheck` and the full `bun test` suite verify the repository.
6. Live checks exercise strength 60, strength 100, radius 1, JSON output, and invalid strength/radius through a running local Habitat API.

For strength 100 at distance zero, verification expects one candidate at 100 percent, all others at 0 percent, and—when the candidate is a material—equal estimated, minimum, and maximum kilograms with `exact: true`. Weaker or more distant results remain probabilistic and use a quantity range.

## Submission deliverables

After review and verification, commit the completed feature with message `Add Habitat resource scanning`, push it to the existing public GitHub repository, save one representative JSON scan response containing `quantityEstimate`, and provide a short recording checklist covering strength 60, exact strength 100, and radius 1 output plus the data-ownership explanation.

The video itself requires the user to record their screen and narration; Codex can prepare commands and a concise script but cannot supply the user's personal explanatory recording.

## Out of scope

- Storing scan results, resource truth, or remaining quantities locally
- Adding a second HTTP client design
- Allowing the CLI caller to supply a Habitat ID or Kepler token
- Changing Kepler's probability or quantity model
- Adding resource extraction, mining, or inventory mutation
