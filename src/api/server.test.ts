import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "./server";
import { readModuleState, writeModuleState, writeRegistration } from "../state";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-api-"));
}

describe("Habitat API", () => {
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
      const app = createApi(cwd, { scanWorld: async (_config, input) => { calls.push(input); return scanResponse; } });
      const response = await app.request("http://test/world/scan?x=3&y=-2&sensorStrength=60&radiusTiles=0");

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
      const cases = [
        ["x=3.5&y=-2&sensorStrength=60&radiusTiles=0", "x must be an integer."],
        ["x=3&y=nope&sensorStrength=60&radiusTiles=0", "y must be an integer."],
        ["x=3&y=-2&sensorStrength=101&radiusTiles=0", "Sensor strength must be an integer from 0 through 100."],
        ["x=3&y=-2&sensorStrength=60&radiusTiles=6", "Radius must be an integer from 0 through 5."],
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
          tokenSource: "test-api-token",
        },
      });
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
