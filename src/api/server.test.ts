import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "./server";
import type { ClockTickEvent } from "../clock-client";
import { defaultClockState, readClockState, readModuleState, readRegistration, readSimulationState, writeClockState, writeExplorationState, writeModuleState, writeRegistration } from "../state";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-api-"));
}

describe("Habitat API", () => {
  test("crew mission routes use persisted humans and explorer position", async () => {
    const cwd = makeTempDir();
    const scans: Array<{ x: number; y: number }> = [];
    try {
      const state = await import("../state");
      state.writeRegistration({ habitatId: "hab-crew", habitatUuid: "uuid-crew", displayName: "Crew", baseUrl: "https://planet.turingguild.com", tokenSource: "test" }, cwd);
      state.writeModuleState({ modules: [
        { id: "cmd-1", blueprintId: "command-module", displayName: "Command", connectedTo: [], runtimeAttributes: { crewCapacity: 2, status: "online" }, capabilities: [] },
        { id: "suit-1", blueprintId: "basic-suitport", displayName: "Suitport", connectedTo: [], runtimeAttributes: { crewCapacity: 1, status: "online" }, capabilities: ["suitport-access"] },
      ], blueprints: [] }, cwd);
      state.writeHumanState({ humans: [{ id: "human-1", displayName: "Avery", locationModuleId: "cmd-1" }] }, cwd);
      state.writeAlertState({ alerts: [] }, cwd);
      const app = createApi(cwd, {
        getCurrentWorldSector: async () => ({ sector: { id: "sector", displayName: "Sector", origin: { x: 0, y: 0 }, bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 }, tileSizeMeters: 100, supportedTerrains: ["flat"] } }),
        scanWorld: async (_config, input) => { scans.push(input); return { scan: { modelVersion: "resource-probability-v2", origin: { x: input.x, y: input.y }, sensorStrength: input.sensorStrength, radiusTiles: input.radiusTiles, tiles: [] } }; },
        collectWorldResource: async (_config, input) => ({ collection: { x: input.x, y: input.y, resourceType: "ferrite", unit: "kg", collectedKg: input.quantityKg, remainingKg: 9 } }),
      });
      expect((await (await app.request("http://test/humans")).json() as any).humans).toHaveLength(1);
      expect((await app.request("http://test/humans/human-1/location", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleId: "suit-1" }) })).status).toBe(200);
      expect((await app.request("http://test/eva/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ humanId: "human-1" }) })).status).toBe(201);
      expect((await app.request("http://test/eva/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: 1, y: 0 }) })).status).toBe(200);
      expect((await app.request("http://test/world/scan?sensorStrength=100&radiusTiles=0")).status).toBe(200);
      expect(scans.at(-1)).toMatchObject({ x: 1, y: 0 });
      expect((await app.request("http://test/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantityKg: 1 }) })).status).toBe(200);
      expect(state.readExplorationState(cwd)?.carriedResources).toEqual({ ferrite: 1 });
      expect((await app.request("http://test/eva/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: 0, y: 0 }) })).status).toBe(200);
      expect((await app.request("http://test/eva/dock", { method: "POST" })).status).toBe(200);
      expect(state.readInventoryState(cwd)?.resources).toEqual({ ferrite: 1 });
      expect(state.readExplorationState(cwd)).toBeNull();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test("GET /world/scan supplies the saved habitat id and preserves the Kepler response", async () => {
    const cwd = makeTempDir();
    const calls: unknown[] = [];
    const scanResponse = {
      scan: {
        modelVersion: "resource-probability-v2" as const,
        origin: { x: 3, y: -2 },
        sensorStrength: 60,
        radiusTiles: 0,
        tiles: [{
          x: 3, y: -2, terrain: "flat" as const, distanceTiles: 0,
          probabilities: [{ resourceType: "ferrite", probabilityPct: 70 }, { resourceType: null, probabilityPct: 30 }],
          topCandidate: { resourceType: "ferrite", probabilityPct: 70 },
          quantityEstimate: { resourceType: "ferrite", unit: "kg" as const, estimatedKg: 180, minimumKg: 140, maximumKg: 220, exact: false },
        }],
      },
    };

    try {
      writeRegistration({ habitatUuid: "11111111-1111-4111-8111-111111111111", habitatId: "habitat-123", displayName: "Artemis Ridge", baseUrl: "https://planet.turingguild.com", tokenSource: "test-token" }, cwd);
      writeExplorationState({ humanId: "human-1", suitportModuleId: "suit-1", x: 3, y: -2, carriedResources: {}, maxCapacityKg: 10 }, cwd);
      const app = createApi(cwd, { scanWorld: async (_config, input) => { calls.push(input); return scanResponse; } });
      const response = await app.request("http://test/world/scan?sensorStrength=60&radiusTiles=0");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(scanResponse);
      expect(calls).toEqual([{ habitatId: "habitat-123", x: 3, y: -2, sensorStrength: 60, radiusTiles: 0 }]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("GET /world/scan rejects missing registration and invalid scan inputs", async () => {
    const cwd = makeTempDir();
    let calls = 0;
    const scanWorld = async () => { calls += 1; throw new Error("must not call Kepler"); };

    try {
      const app = createApi(cwd, { scanWorld });
      const missingRegistration = await app.request("http://test/world/scan?x=3&y=-2&sensorStrength=60&radiusTiles=0");
      expect(missingRegistration.status).toBe(400);
      expect(await missingRegistration.json()).toEqual({ error: 'No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.' });

      writeRegistration({ habitatUuid: "11111111-1111-4111-8111-111111111111", habitatId: "habitat-123", displayName: "Artemis Ridge", baseUrl: "https://planet.turingguild.com", tokenSource: "test-token" }, cwd);
      writeExplorationState({ humanId: "human-1", suitportModuleId: "suit-1", x: 3, y: -2, carriedResources: {}, maxCapacityKg: 10 }, cwd);
      const cases = [
        ["sensorStrength=101&radiusTiles=0", "Sensor strength must be an integer from 0 through 100."],
        ["sensorStrength=60&radiusTiles=6", "Radius must be an integer from 0 through 5."],
      ] as const;
      for (const [query, message] of cases) {
        const response = await app.request(`http://test/world/scan?${query}`);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: message });
      }
      expect(calls).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("allows the local Vite dashboard to call the API", async () => {
    const response = await createApi().request("http://test/state", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  test("GET /registration returns null when no registration exists", async () => {
    const cwd = makeTempDir();

    try {
      const response = await createApi(cwd).request("http://test/registration");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ registration: null });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("GET /registration returns the persisted registration", async () => {
    const cwd = makeTempDir();

    try {
      writeRegistration(
        {
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          habitatId: "habitat-123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "test-api-token",
        },
        cwd,
      );

      const response = await createApi(cwd).request("http://test/registration");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        registration: {
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          habitatId: "habitat-123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "test-api-token",
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("POST /registration saves stream credentials and defaults clock listening to off", async () => {
    const cwd = makeTempDir();
    const requests: Array<{ displayName: string; habitatUuid: string }> = [];
    const response = {
      habitatId: "habitat-123",
      streamUrl: "wss://planet.turingguild.com/planet/stream",
      apiToken: "habitat-stream-secret",
      stream: {
        protocolVersion: "1.0",
        subscriptions: ["ticks"] as Array<"ticks">,
        currentTick: 800,
        tickIntervalMs: 5000,
        ticksPerPulse: 1,
        status: "running" as const,
      },
      contracts: { alerts: { schemaVersion: "1.0", schema: {} } },
      starterModules: [],
      starterHumans: [],
      blueprints: [],
    };

    try {
      const app = createApi(cwd, {
        registerHabitat: async (_config, displayName, habitatUuid) => {
          requests.push({ displayName, habitatUuid });
          return response;
        },
      });
      const registered = await app.request("http://test/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Artemis Ridge" }),
      });

      expect(registered.status).toBe(201);
      expect(readRegistration(cwd)).toMatchObject({
        habitatId: "habitat-123",
        streamUrl: response.streamUrl,
        apiToken: response.apiToken,
        stream: response.stream,
      });
      expect(readClockState(cwd)).toMatchObject({ mode: "manual", connectionState: "disconnected" });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.displayName).toBe("Artemis Ridge");
      expect(requests[0]?.habitatUuid).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("POST /registration reuses the saved UUID when upgrading a legacy registration", async () => {
    const cwd = makeTempDir();
    const habitatUuid = "11111111-1111-4111-8111-111111111111";
    let requestedUuid = "";

    try {
      writeRegistration({ habitatUuid, habitatId: "habitat-legacy", displayName: "Artemis Ridge", baseUrl: "https://planet.turingguild.com", tokenSource: "test-token" }, cwd);
      writeModuleState({ modules: [{ id: "built-module-1", blueprintId: "greenhouse", displayName: "Built Greenhouse", connectedTo: [], runtimeAttributes: {}, capabilities: [] }], blueprints: [] }, cwd);
      const app = createApi(cwd, {
        registerHabitat: async (_config, _displayName, uuid) => {
          requestedUuid = uuid;
          return {
            habitatId: "habitat-legacy",
            streamUrl: "wss://planet.turingguild.com/planet/stream",
            apiToken: "upgraded-stream-secret",
            stream: { protocolVersion: "1.0", subscriptions: ["ticks"], currentTick: 900, tickIntervalMs: 5000, ticksPerPulse: 1, status: "running" },
            contracts: { alerts: { schemaVersion: "1.0", schema: {} } },
            starterModules: [],
            starterHumans: [],
            blueprints: [],
          };
        },
      });

      const registered = await app.request("http://test/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Artemis Ridge" }),
      });

      expect(registered.status).toBe(201);
      expect(requestedUuid).toBe(habitatUuid);
      expect(readRegistration(cwd)?.habitatUuid).toBe(habitatUuid);
      expect(readModuleState(cwd)?.modules.map((module) => module.id)).toEqual(["built-module-1"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("DELETE /registration clears backend registration state", async () => {
    const cwd = makeTempDir();

    try {
      writeRegistration(
        {
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          habitatId: "habitat-123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "test-api-token",
        },
        cwd,
      );

      const response = await createApi(cwd).request("http://test/registration", { method: "DELETE" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      await expect((await createApi(cwd).request("http://test/registration")).json()).resolves.toEqual({ registration: null });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("catalog and solar routes return structured Kepler data", async () => {
    const cwd = makeTempDir();

    try {
      const app = createApi(cwd, {
      listBlueprintCatalog: async () => ({ catalogVersion: "catalog-test", blueprints: [] }),
      getBlueprint: async (_config, blueprintId) => ({
        id: `blueprint-${blueprintId}`,
        blueprintId,
        displayName: "Test Blueprint",
        description: "A test blueprint.",
        status: "published",
        output: {},
        inputs: {},
        buildTicks: 10,
        repeatable: false,
      }),
      listResourceCatalog: async () => ({ catalogVersion: "catalog-test", resources: [] }),
      getSolarIrradiance: async () => ({ solarIrradiance: { wPerM2: 900, condition: "clear" } }),
      });

      const blueprintList = await app.request("http://test/catalog/blueprints");
      const blueprintShow = await app.request("http://test/catalog/blueprints/test-blueprint");
      const resources = await app.request("http://test/catalog/resources");
      const solar = await app.request("http://test/solar/irradiance");

      expect(blueprintList.status).toBe(200);
      expect(await blueprintList.json()).toEqual({ catalogVersion: "catalog-test", blueprints: [] });
      expect(await blueprintShow.json()).toMatchObject({ blueprint: { blueprintId: "test-blueprint" } });
      expect(await resources.json()).toEqual({ catalogVersion: "catalog-test", resources: [] });
      expect(await solar.json()).toEqual({ solarIrradiance: { wPerM2: 900, condition: "clear" } });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("module resource routes reuse the backend module state service", async () => {
    const cwd = makeTempDir();

    try {
      writeModuleState({
        modules: [{
          id: "module-1",
          blueprintId: "command-module",
          displayName: "Command Module",
          connectedTo: [],
          runtimeAttributes: { status: "online" },
          capabilities: ["habitat-command"],
        }],
        blueprints: [],
      }, cwd);
      const app = createApi(cwd);

      const list = await app.request("http://test/modules");
      expect(await list.json()).toMatchObject({ modules: [{ id: "module-1" }] });

      const show = await app.request("http://test/modules/module-1");
      expect(await show.json()).toMatchObject({ id: "module-1", displayName: "Command Module" });

      const created = await app.request("http://test/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprintId: "sensor-mast", displayName: "Sensor Mast", connectedTo: [], runtimeAttributes: {}, capabilities: [] }),
      });
      const createdModule = await created.json() as { id: string };
      expect(created.status).toBe(201);

      const updated = await app.request(`http://test/modules/${createdModule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Sensor Mast" }),
      });
      expect(await updated.json()).toMatchObject({ id: createdModule.id, displayName: "Updated Sensor Mast" });

      const deleted = await app.request(`http://test/modules/${createdModule.id}`, { method: "DELETE" });
      expect(await deleted.json()).toEqual({ ok: true });
      expect(readModuleState(cwd)?.modules).toHaveLength(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("inventory resource routes adjust backend inventory state", async () => {
    const cwd = makeTempDir();

    try {
      const app = createApi(cwd);
      const add = await app.request("http://test/inventory/resources/ferrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 12 }),
      });
      expect(await add.json()).toEqual({ resources: { ferrite: 12 } });

      const remove = await app.request("http://test/inventory/resources/ferrite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 5 }),
      });
      expect(await remove.json()).toEqual({ resources: { ferrite: 7 } });

      const invalid = await app.request("http://test/inventory/resources/ferrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: -1 }),
      });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ error: "Inventory quantity must be a positive number." });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("POST /ticks rejects manual ticks while Kepler listening mode is saved", async () => {
    const cwd = makeTempDir();
    try {
      writeModuleState({ modules: [], blueprints: [] }, cwd);
      writeClockState({ ...defaultClockState(), mode: "kepler" }, cwd);
      const response = await createApi(cwd, {
        getSolarIrradiance: async () => ({ solarIrradiance: { wPerM2: 0, condition: "dark" } }),
      }).request("http://test/ticks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Manual ticks are disabled while listening to Kepler. Run `habitat clock listen off` to return to manual mode." });
      expect(readSimulationState(cwd)).toBeNull();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("clock status and listening routes expose the selected mode through the local API", async () => {
    const cwd = makeTempDir();
    const calls: string[] = [];
    const controller = {
      status: () => readClockState(cwd),
      listenOn: async () => { calls.push("on"); writeClockState({ ...readClockState(cwd), mode: "kepler", connectionState: "connecting" }, cwd); },
      listenOff: async () => { calls.push("off"); writeClockState({ ...readClockState(cwd), mode: "manual", connectionState: "disconnected" }, cwd); },
      subscribe: () => () => {}, start: async () => {}, shutdown: async () => {}, idle: async () => {},
    };
    try {
      const app = createApi(cwd, { clockController: controller });
      expect(await (await app.request("http://test/clock/status")).json()).toMatchObject({ mode: "manual", listening: false, manualTicksAllowed: true, connectionState: "disconnected" });
      expect((await app.request("http://test/clock/listen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listening: true }) })).status).toBe(200);
      expect(await (await app.request("http://test/clock/status")).json()).toMatchObject({ mode: "kepler", listening: true, manualTicksAllowed: false, connectionState: "connecting" });
      await app.request("http://test/clock/listen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listening: false }) });
      expect(calls).toEqual(["on", "off"]);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("GET /clock/events streams only future safe tick events", async () => {
    const cwd = makeTempDir();
    let listener: ((event: ClockTickEvent) => void) | null = null;
    const controller = {
      status: () => readClockState(cwd), listenOn: async () => {}, listenOff: async () => {}, start: async () => {}, shutdown: async () => {}, idle: async () => {},
      subscribe: (next: (event: ClockTickEvent) => void) => { listener = next; return () => { listener = null; }; },
    };
    try {
      const response = await createApi(cwd, { clockController: controller }).request("http://test/clock/events");
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const reader = response.body!.getReader();
      listener!({ tick: 900, previousTick: 800, advancedBy: 100, issuedAt: "2026-07-17T14:30:00.000Z", applied: true });
      const chunk = await reader.read();
      const text = new TextDecoder().decode(chunk.value);
      expect(text).toContain("event: planet_tick");
      expect(text).toContain('"advancedBy":100');
      expect(text).not.toContain("apiToken");
      await reader.cancel();
      expect(listener).toBeNull();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("injectable logging records safe API and Kepler summaries", async () => {
    const cwd = makeTempDir();
    const logs: string[] = [];

    try {
      writeRegistration(
        {
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          habitatId: "habitat-123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "secret-habitat-token",
        },
        cwd,
      );
      const app = createApi(cwd, {
        logger: (line) => logs.push(line),
        listBlueprintCatalog: async () => ({ catalogVersion: "catalog-test", blueprints: [] }),
      });

      await app.request("http://test/registration");
      await app.request("http://test/catalog/blueprints");

      expect(logs).toContain("[habitat-api] GET /registration -> registered");
      expect(logs).toContain("[habitat-api] GET /catalog/blueprints -> proxied to Kepler");
      expect(logs).toContain("[kepler] GET /catalog/blueprints -> 200");
      expect(logs.join("\n")).not.toContain("secret-habitat-token");
      expect(logs.join("\n")).not.toContain("Bearer");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
