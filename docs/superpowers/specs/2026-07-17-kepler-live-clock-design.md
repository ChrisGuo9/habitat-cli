# Kepler Live Clock Design

## Goal

Extend the existing Habitat backend so registration persists Kepler stream credentials and metadata, the backend can switch safely between manual simulation ticks and live Kepler tick notices, and CLI operators can control and observe the selected mode entirely through the local Habitat API.

## Confirmed Kepler Contract

The live OpenAPI document at `https://planet.turingguild.com/openapi.json` is authoritative for exact fields.

`POST /habitats/register` continues to use the configured planet bearer token to authorize registration. Its response contains a different, Habitat-specific `apiToken`. That returned token authenticates the WebSocket `hello` and must be persisted as part of the authoritative registration record.

The response fields used by this capability are:

- `habitatId`
- `streamUrl`
- `apiToken`
- `stream.protocolVersion`
- `stream.subscriptions`
- `stream.currentTick`
- `stream.tickIntervalMs`
- `stream.ticksPerPulse`
- `stream.status`

The backend opens the saved `streamUrl` without query credentials and sends:

```json
{
  "type": "hello",
  "apiToken": "<saved Habitat stream token>",
  "subscribe": ["ticks"]
}
```

It accepts tick messages only after a valid `hello_ack` whose `habitatId` matches the saved registration. It validates `planet_tick.tick`, `previousTick`, `advancedBy`, and `issuedAt`, with `advancedBy` required to be a positive safe integer.

The hello intentionally omits the optional `lastAppliedPlanetTick`. The Habitat applies only messages received during the current authenticated connection and never requests catch-up ticks.

## Existing Architecture to Preserve

- `src/api/server.ts` owns the Hono REST backend and remains the only process that changes authoritative live-clock state.
- `src/api/client.ts` remains the CLI-to-local-API boundary.
- `src/state.ts` remains the SQLite persistence layer using `habitat.sqlite` and the `habitat_state` key/value table.
- `src/simulation.ts` remains the simulation rules implementation.
- The CLI and React dashboard remain local Habitat API clients and never connect directly to Kepler.
- Existing module, construction, inventory, power, solar, scanning, and simulation behavior remains intact.

## Registration Persistence and Status

`HabitatRegistration` gains one authoritative copy of `streamUrl`, `apiToken`, and the complete returned stream metadata. No clock-specific token copy is created.

New registrations create a clock record in manual mode with listening off. Re-registering a legacy Habitat reuses its saved `habitatUuid` and display name request flow so Kepler can upgrade that registration in place. It does not unregister or create a replacement UUID.

`GET /registration` and `habitat status` expose the saved stream URL, full stream API token, subscriptions, protocol version, registration-time current tick, interval, ticks per pulse, and clock status. Stable JSON field names mirror the saved registration shape. The API token is intentionally visible only through explicit local status operations; logs must never contain it.

## Clock State

The SQLite state layer adds a `clock` key with this authoritative shape:

```ts
type HabitatClockState = {
  mode: "manual" | "kepler";
  connectionState: "disconnected" | "connecting" | "connected" | "error";
  lastKeplerTick: number | null;
  lastAdvancedBy: number | null;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastConnectionError: string | null;
};
```

`mode` is durable. Connection state describes the current backend process and is reset appropriately on process startup; the selected mode survives restarts. A missing clock record is treated as manual mode for backward compatibility.

## Shared Tick Operation

A focused backend operation becomes the single entry point for applying simulation ticks. It reads the current module, simulation, and construction state, obtains the required solar reading, calls `runSimulationTicks`, and persists the resulting state.

Manual `POST /ticks` checks the authoritative clock mode before applying anything. In Kepler mode it rejects the request with an explanation that manual ticks are disabled and that `habitat clock listen off` returns to manual mode.

The live-clock path passes the complete `advancedBy` into the same operation. A valid notice is applied only when its absolute `tick` is greater than the saved `lastKeplerTick`. The resulting simulation changes and latest clock message information are written under one serialized backend operation so mode changes, manual ticks, and live ticks cannot race within the process.

## Backend-Owned WebSocket

`src/clock-client.ts` is a focused controller with injected WebSocket, clock, persistence, and tick-application dependencies for deterministic tests. It:

1. Reads saved registration and clock mode.
2. Saves `connecting` state and opens the saved `streamUrl`.
3. Sends the Habitat-specific token only in the first `hello` message.
4. Validates `hello_ack`, Habitat identity, and acknowledged subscriptions.
5. Accepts `planet_tick` only after authentication and only while mode remains `kepler`.
6. Validates positive whole-number `advancedBy` and future absolute ticks.
7. Applies each accepted advance exactly once through the shared tick operation.
8. Records safe connection errors without tokens.
9. Reconnects after an unexpected disconnect using a bounded delay, without replaying missed ticks.
10. Stops cleanly when listening is disabled or the backend exits.

The controller serializes tick application and mode transitions. Turning listening on saves Kepler mode before opening the socket. Turning it off closes the socket, waits for an in-flight tick to finish, then saves manual mode.

`startServer()` creates exactly one controller and starts it automatically if saved mode is `kepler`. Shutdown handlers close it cleanly.

## Local Clock API and Event Stream

The Hono backend exposes:

- `GET /clock/status`
- `POST /clock/listen` with `{ "listening": true | false }`
- `GET /clock/events`

Clock status reports mode, `listening`, `manualTicksAllowed`, connection state, latest absolute Kepler tick, latest `advancedBy`, timestamps, and the latest safe error.

`GET /clock/events` is a future-only Server-Sent Events stream. Each connected local observer receives tick events accepted after that observer connected. Events contain `tick`, `previousTick`, `advancedBy`, `issuedAt`, and `applied`; they never contain registration credentials. Disconnecting an SSE observer removes only that observer and does not affect the WebSocket controller.

## CLI Contract

The CLI provides:

```text
habitat clock status
habitat clock listen on
habitat clock listen off
habitat clock watch
habitat tick <count>
```

Human-readable clock status clearly reports manual or Kepler mode, listening state, whether manual ticks are allowed, connection state, latest tick and advance, and any error. Listening commands print the resulting clock state.

`habitat clock watch` consumes only the local SSE route and prints one line per future event with absolute tick, `advancedBy`, `issuedAt`, and whether it was applied. Ctrl+C closes only the local watch request. If the repository's machine-readable mode supports streaming, `--jsonl` prints one stable JSON object per event.

The implementation will add stable global `--json` output for status operations and `--jsonl` for watch where absent, while preserving existing human-readable output.

## Error Handling and Security

- Missing stream credentials produce an actionable instruction to repeat registration with the same Habitat identity.
- Connection or authentication failure leaves mode set to `kepler`, reports `error`, and keeps REST serving.
- Invalid JSON, invalid acknowledgement, wrong Habitat identity, unsupported acknowledgement subscriptions, and malformed ticks are rejected without changing simulation state.
- Duplicate and older absolute ticks are ignored.
- No catch-up request is sent and reconnect never applies messages missed while disconnected.
- The registration bearer token and returned stream token are never logged.
- SSE events and connection logs contain only safe identifiers, absolute tick values, and `advancedBy`.

## Testing and Verification

Implementation follows red-green-refactor increments:

1. Registration schema, persistence, legacy UUID reuse, status, and default manual mode.
2. Clock-state persistence and restart-safe status.
3. Shared tick operation and manual-tick rejection in Kepler mode.
4. WebSocket hello, acknowledgement validation, tick validation, full `advancedBy`, duplicate suppression, reconnect, and clean stop.
5. Hono listen/status/SSE routes and future-only event fan-out.
6. CLI status, listen, watch, JSON, and JSONL behavior.
7. Full typecheck, tests, build, CLI/API integration, restart, journal, and live Kepler verification.

Final live verification returns the Habitat to manual mode. Only after all requirements pass will the implementation be staged, committed with `Connect Habitat to the Kepler live clock`, pushed to the existing public repository, and reported with its public URL.
