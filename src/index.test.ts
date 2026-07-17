import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readConstructionState, readInventoryState, readModuleState, readRegistration, readSimulationState } from "./state";

const cliPath = resolve(import.meta.dir, "index.ts");
const serverPath = resolve(import.meta.dir, "server.ts");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-cli-"));
}

async function runCli(args: string[], cwd: string, env: Record<string, string>) {
  const server = Bun.spawn({
    cmd: ["bun", "run", serverPath],
    cwd,
    env: { ...process.env, ...env, HABITAT_API_HOST: "127.0.0.1", HABITAT_API_PORT: "8787" },
    stdout: "ignore",
    stderr: "pipe",
  });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:8787/registration");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The server may still be starting.
    }
    await Bun.sleep(20);
  }

  if (!ready) {
    server.kill();
    throw new Error("Test Habitat API server did not start.");
  }

  const child = Bun.spawn({
    cmd: ["bun", "run", cliPath, ...args],
    cwd,
    env: { ...process.env, ...env, HABITAT_API_BASE_URL: "http://127.0.0.1:8787" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  server.kill();
  await server.exited;
  return { stdout, stderr, exitCode };
}

async function deployAt(cwd: string, x: number, y: number): Promise<void> {
  const env = { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" };
  const deployed = await runCli(["eva", "deploy", "starter-human-1"], cwd, env);
  if (deployed.exitCode !== 0) throw new Error(deployed.stderr);
  let currentX = 0; let currentY = 0;
  while (currentX !== x) { currentX += Math.sign(x - currentX); const result = await runCli(["eva", "move", String(currentX), String(currentY)], cwd, env); if (result.exitCode !== 0) throw new Error(result.stderr); }
  while (currentY !== y) { currentY += Math.sign(y - currentY); const result = await runCli(["eva", "move", String(currentX), String(currentY)], cwd, env); if (result.exitCode !== 0) throw new Error(result.stderr); }
}

let server: Bun.Server<undefined>;
let baseUrl = "";
const requests: Array<{ method: string; pathname: string; body: string | null }> = [];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      return (async () => {
        const body = request.method === "GET" || request.method === "DELETE" ? null : await request.text();
        requests.push({ method: request.method, pathname: url.pathname, body });

        if (url.pathname === "/habitats/register" && request.method === "POST") {
          return Response.json(
            {
              habitatId: "habitat_11111111_1111_4111_8111_111111111111",
              streamUrl: "wss://planet.turingguild.com/planet/stream",
              apiToken: "habitat-stream-secret",
              stream: {
                protocolVersion: "1.0",
                subscriptions: ["ticks"],
                currentTick: 800,
                tickIntervalMs: 5000,
                ticksPerPulse: 1,
                status: "running",
              },
              contracts: { alerts: { schemaVersion: "1.0", schema: {} } },
              starterHumans: [{ id: "starter-human-1", displayName: "Avery", locationModuleId: "starter-basic-suitport-1" }],
              starterModules: [
                {
                  id: "starter-command-1",
                  blueprintId: "command-module",
                  displayName: "Command Module",
                  connectedTo: [],
                  runtimeAttributes: { health: 100, status: "active", crewCapacity: 2 },
                  capabilities: ["habitat-command"],
                },
                {
                  id: "starter-life-support-1",
                  blueprintId: "life-support",
                  displayName: "Life Support",
                  connectedTo: ["starter-command-1"],
                  runtimeAttributes: { health: 100, status: "active", crewCapacity: 2 },
                  capabilities: ["atmosphere-control", "redundant-life-support"],
                },
                {
                  id: "starter-basic-battery-1",
                  blueprintId: "basic-battery",
                  displayName: "Basic Battery",
                  connectedTo: ["starter-command-1"],
                  runtimeAttributes: { health: 100, status: "offline", currentEnergyKwh: 500 },
                  capabilities: ["power-storage"],
                },
                {
                  id: "starter-supply-cache-1",
                  blueprintId: "supply-cache",
                  displayName: "Supply Cache",
                  connectedTo: ["starter-command-1"],
                  runtimeAttributes: { health: 100, status: "offline", storageMassKg: 6000 },
                  capabilities: ["storage"],
                },
                {
                  id: "starter-workshop-fabricator-1",
                  blueprintId: "workshop-fabricator",
                  displayName: "Workshop Fabricator",
                  connectedTo: ["starter-command-1"],
                  runtimeAttributes: { health: 100, status: "online" },
                  capabilities: ["basic-fabrication"],
                },
                {
                  id: "starter-basic-suitport-1",
                  blueprintId: "basic-suitport",
                  displayName: "Basic Suitport",
                  connectedTo: ["starter-command-1"],
                  runtimeAttributes: { health: 100, status: "online" },
                  capabilities: ["limited-eva", "suitport-access"],
                },
              ],
              blueprints: [
                {
                  id: "blueprint-command-module",
                  blueprintId: "command-module",
                  displayName: "Command Module Blueprint",
                  description: "Primary command center.",
                  status: "published",
                  output: {},
                  inputs: {},
                  buildTicks: 120,
                  repeatable: false,
                  requiredFacility: ["workshop-fabricator"],
                  prerequisites: ["life-support"],
                  productionCost: { iron: 4, circuit: 2 },
                  runtimeAttributes: { crewCapacity: 2 },
                  capabilities: ["habitat-command"],
                },
              ],
            },
            { status: 201 },
          );
        }

        if (url.pathname === "/catalog/blueprints" && request.method === "GET") {
          return Response.json({
            catalogVersion: "2026-06-24",
            blueprints: [
              {
                id: "blueprint-command-module",
                blueprintId: "command-module",
                displayName: "Command Module Blueprint",
                description: "Primary command center.",
                status: "published",
                output: {},
                inputs: {},
                buildTicks: 120,
                repeatable: false,
                requiredFacility: ["workshop-fabricator"],
                prerequisites: ["life-support"],
                productionCost: { iron: 4, circuit: 2 },
                runtimeAttributes: { crewCapacity: 2 },
                capabilities: ["habitat-command"],
              },
              {
                id: "blueprint-basic-battery",
                blueprintId: "basic-battery",
                displayName: "Basic Battery Blueprint",
                description: "Stores electrical energy.",
                status: "published",
                output: {},
                inputs: {},
                buildTicks: 90,
                repeatable: true,
                runtimeAttributes: { energyStorageKwh: 20 },
                capabilities: ["power-storage"],
              },
            ],
          });
        }

        if (url.pathname === "/catalog/blueprints/command-module" && request.method === "GET") {
          return Response.json({
            blueprint: {
              id: "blueprint-command-module",
              blueprintId: "command-module",
              displayName: "Command Module Blueprint",
              description: "Primary command center.",
              status: "published",
              output: {},
              inputs: {},
              buildTicks: 120,
              repeatable: false,
              requiredFacility: ["workshop-fabricator"],
              prerequisites: ["life-support"],
              productionCost: { iron: 4, circuit: 2 },
              runtimeAttributes: { crewCapacity: 2 },
              capabilities: ["habitat-command"],
            },
          });
        }

        if (url.pathname === "/catalog/blueprints/small-solar-array" && request.method === "GET") {
          return Response.json({
            blueprint: {
              id: "blueprint_kepler-442b-v1_small-solar-array",
              blueprintId: "small-solar-array",
              displayName: "Small Solar Array Blueprint",
              description: "Generates starter solar power during clear daylight, with reduced output during dust accumulation and storm conditions.",
              status: "published",
              output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
              inputs: { ferrite: 90, "silicate-glass": 45, "conductive-ore": 18 },
              productionCost: { power: 3 },
              requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
              buildTicks: 180,
              prerequisites: [],
              unlocks: [],
              repeatable: true,
              level: null,
              target: {},
              facilityLevel: {},
              attachmentPoints: {},
              attachmentRequirements: [],
              runtimeAttributes: {
                health: 100,
                powerDrawKw: { offline: 0, online: 0, active: 0, damaged: 0 },
                status: "online",
                crewCapacity: 0,
                powerGenerationKw: 12,
                degradedStormGenerationKw: 3,
                maintenanceHoursPer100Ticks: 4,
                surfaceAreaM2: 28,
              },
              capabilities: ["solar-generation"],
            },
          });
        }

        if (url.pathname === "/catalog/resources" && request.method === "GET") {
          return Response.json({
            catalogVersion: "2026-06-24",
            resources: [
              {
                id: "resource-iron",
                resourceType: "iron-ore",
                displayName: "Iron Ore",
                kind: "mineral",
                rarity: "common",
                description: "Raw iron-bearing material.",
                unit: "kg",
              },
              {
                id: "resource-ice",
                resourceType: "water-ice",
                displayName: "Water Ice",
                kind: "volatile",
                rarity: "uncommon",
                description: "Frozen water resource.",
                unit: "kg",
              },
            ],
          });
        }

        if (url.pathname === "/habitats/habitat_11111111_1111_4111_8111_111111111111/registration" && request.method === "GET") {
          return Response.json({
            habitat: {
              id: "habitat_11111111_1111_4111_8111_111111111111",
              habitatSlug: "artemis-ridge",
              displayName: "Artemis Ridge",
              catalogVersion: "2026-06-24",
              status: "online",
              lastSeenAt: "2026-07-09T12:34:56.000Z",
            },
          });
        }

        if (url.pathname === "/world/solar-irradiance" && request.method === "GET") {
          if (request.headers.get("Authorization") === "Bearer solar-failure-token") {
            return new Response("solar service unavailable", { status: 503 });
          }
          return Response.json({
            solarIrradiance: { wPerM2: 900, condition: "clear" },
          });
        }

        if (url.pathname === "/world/scan" && request.method === "GET") {
          if (url.searchParams.get("habitatId") !== "habitat_11111111_1111_4111_8111_111111111111") {
            return Response.json({ error: "missing habitatId" }, { status: 400 });
          }
          const x = Number(url.searchParams.get("x"));
          const y = Number(url.searchParams.get("y"));
          const sensorStrength = Number(url.searchParams.get("sensorStrength"));
          const radiusTiles = Number(url.searchParams.get("radiusTiles"));
          const exact = sensorStrength === 100;
          const coordinates = radiusTiles === 0
            ? [[x, y]]
            : Array.from({ length: radiusTiles * 2 + 1 }, (_, row) =>
                Array.from({ length: radiusTiles * 2 + 1 }, (_, column) => [x + column - radiusTiles, y + row - radiusTiles]),
              ).flat();
          return Response.json({
            scan: {
              modelVersion: "resource-probability-v2",
              origin: { x, y },
              sensorStrength,
              radiusTiles,
              tiles: coordinates.map(([tileX, tileY]) => {
                const distanceTiles = Number(Math.hypot(tileX! - x, tileY! - y).toFixed(3));
                return {
                  x: tileX, y: tileY, terrain: "flat", distanceTiles,
                  probabilities: exact && distanceTiles === 0
                    ? [
                        { resourceType: "ferrite", probabilityPct: 100 },
                        { resourceType: "silicate-glass", probabilityPct: 0 },
                        { resourceType: "conductive-ore", probabilityPct: 0 },
                        { resourceType: "water-ice", probabilityPct: 0 },
                        { resourceType: null, probabilityPct: 0 },
                      ]
                    : [
                        { resourceType: "ferrite", probabilityPct: 55 },
                        { resourceType: "silicate-glass", probabilityPct: 15 },
                        { resourceType: "conductive-ore", probabilityPct: 10 },
                        { resourceType: "water-ice", probabilityPct: 5 },
                        { resourceType: null, probabilityPct: 15 },
                      ],
                  topCandidate: x === -1 ? { resourceType: null, probabilityPct: 55 } : { resourceType: "ferrite", probabilityPct: exact && distanceTiles === 0 ? 100 : 55 },
                  quantityEstimate: x === -1 ? null : exact && distanceTiles === 0
                    ? { resourceType: "ferrite", unit: "kg", estimatedKg: 184, minimumKg: 184, maximumKg: 184, exact: true }
                    : { resourceType: "ferrite", unit: "kg", estimatedKg: 180, minimumKg: 140, maximumKg: 220, exact: false },
                };
              }),
            },
          });
        }

        if (url.pathname === "/world/sectors/current" && request.method === "GET") {
          return Response.json({ sector: { id: "sector-1", displayName: "Test Sector", origin: { x: 0, y: 0 }, bounds: { minX: -25, maxX: 24, minY: -25, maxY: 24 }, tileSizeMeters: 100, supportedTerrains: ["flat"] } });
        }

        return new Response("not found", { status: 404 });
      })();
    },
  });

  baseUrl = server.url.origin;
});

afterAll(() => {
  server.stop(true);
});

describe("habitat cli", () => {
  test("solar status reports current Kepler irradiance", async () => {
    const cwd = makeTempDir();

    try {
      const result = await runCli(["solar", "status"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Solar Status");
      expect(result.stdout).toContain("wPerM2");
      expect(result.stdout).toContain("900");
      expect(result.stdout).toContain("condition");
      expect(result.stdout).toContain("clear");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tick leaves local state unchanged when solar data is unavailable", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      const result = await runCli(["tick", "1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "solar-failure-token",
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Kepler request failed (503)");
      expect(readSimulationState(cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("module set-status updates only runtimeAttributes.status and reports power draw in that state", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(
        await runCli(
          [
            "module",
            "update",
            "battery-1",
            "--runtime-attribute",
            "health=100",
            "--runtime-attribute",
            "status=offline",
            "--runtime-attribute",
            "currentEnergyKwh=10",
            "--runtime-attribute",
            "energyStorageKwh=20",
            "--runtime-attribute",
            "powerDrawKw=0.5",
          ],
          cwd,
          {
            KEPLER_BASE_URL: baseUrl,
            KEPLER_PLANET_TOKEN: "test-token",
          },
        ),
      ).toMatchObject({ exitCode: 0 });

      const before = readModuleState(cwd)!;
      const beforeBattery = before.modules.find((module: { id: string }) => module.id === "starter-basic-battery-1");
      expect(beforeBattery?.runtimeAttributes).toMatchObject({
        health: 100,
        status: "offline",
        currentEnergyKwh: 10,
        energyStorageKwh: 20,
        powerDrawKw: 0.5,
      });

      const result = await runCli(["module", "set-status", "battery-1", "online"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Module Status");
      expect(result.stdout).toContain("moduleId");
      expect(result.stdout).toContain("battery-1");
      expect(result.stdout).toContain("status");
      expect(result.stdout).toContain("online");
      expect(result.stdout).toContain("powerDrawKw");
      expect(result.stdout).toContain("0.5");

      const after = readModuleState(cwd)!;
      const afterBattery = after.modules.find((module: { id: string }) => module.id === "starter-basic-battery-1");
      expect(afterBattery?.runtimeAttributes).toEqual({
        health: 100,
        status: "online",
        currentEnergyKwh: 10,
        energyStorageKwh: 20,
        powerDrawKw: 0.5,
      });
      expect(afterBattery?.displayName).toBe(beforeBattery?.displayName);
      expect(afterBattery?.capabilities).toEqual(beforeBattery?.capabilities);
      expect(afterBattery?.connectedTo).toEqual(beforeBattery?.connectedTo);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("module set-status validates allowed states", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["module", "set-status", "battery-1", "charging"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Invalid module status: charging. Expected one of: offline, idle, online, active, damaged.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("module status prints a text table and power summary", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(
        await runCli(
          [
            "module",
            "update",
            "life-1",
            "--runtime-attribute",
            "health=100",
            "--runtime-attribute",
            "status=active",
            "--runtime-attribute",
            "powerDrawKw=2.5",
          ],
          cwd,
          {
            KEPLER_BASE_URL: baseUrl,
            KEPLER_PLANET_TOKEN: "test-token",
          },
        ),
      ).toMatchObject({ exitCode: 0 });

      expect(
        await runCli(
          [
            "module",
            "update",
            "battery-1",
            "--runtime-attribute",
            "health=100",
            "--runtime-attribute",
            "status=online",
            "--runtime-attribute",
            "currentEnergyKwh=10",
            "--runtime-attribute",
            "energyStorageKwh=20",
            "--runtime-attribute",
            "powerDrawKw=0.5",
          ],
          cwd,
          {
            KEPLER_BASE_URL: baseUrl,
            KEPLER_PLANET_TOKEN: "test-token",
          },
        ),
      ).toMatchObject({ exitCode: 0 });

      expect(
        await runCli(
          [
            "module",
            "update",
            "cache-1",
            "--runtime-attribute",
            "health=100",
            "--runtime-attribute",
            "status=offline",
            "--runtime-attribute",
            "storageMassKg=6000",
            "--runtime-attribute",
            "powerDrawKw=1.25",
          ],
          cwd,
          {
            KEPLER_BASE_URL: baseUrl,
            KEPLER_PLANET_TOKEN: "test-token",
          },
        ),
      ).toMatchObject({ exitCode: 0 });

      expect(
        await runCli(
          [
            "module",
            "create",
            "--blueprint-id",
            "sensor-mast",
            "--name",
            "Sensor Mast",
            "--runtime-attribute",
            "status=damaged",
            "--runtime-attribute",
            "powerDrawKw=3",
          ],
          cwd,
          {
            KEPLER_BASE_URL: baseUrl,
            KEPLER_PLANET_TOKEN: "test-token",
          },
        ),
      ).toMatchObject({ exitCode: 0 });

      const result = await runCli(["module", "status"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("MODULE");
      expect(result.stdout).toContain("STATE");
      expect(result.stdout).toContain("POWER DRAW (kW)");
      expect(result.stdout).toContain("Life Support");
      expect(result.stdout).toContain("active");
      expect(result.stdout).toContain("2.5");
      expect(result.stdout).toContain("Basic Battery");
      expect(result.stdout).toContain("online");
      expect(result.stdout).toContain("0.5");
      expect(result.stdout).toContain("Supply Cache");
      expect(result.stdout).toContain("offline");
      expect(result.stdout).toContain("0");
      expect(result.stdout).toContain("Sensor Mast");
      expect(result.stdout).toContain("damaged");
      expect(result.stdout).toContain("totalPowerDrawKw=3");
      expect(result.stdout).toContain("tickEnergyKwh=0.000833");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tick advances the current tick and updates persisted battery energy", async () => {
    const cwd = makeTempDir();
    requests.length = 0;

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const updateBattery = await runCli(
        [
          "module",
          "update",
          "battery-1",
          "--runtime-attribute",
          "health=100",
          "--runtime-attribute",
          "status=offline",
          "--runtime-attribute",
          "currentEnergyKwh=10",
          "--runtime-attribute",
          "energyStorageKwh=20",
        ],
        cwd,
        {
          KEPLER_BASE_URL: baseUrl,
          KEPLER_PLANET_TOKEN: "test-token",
        },
      );
      expect(updateBattery.exitCode).toBe(0);

      const createLoad = await runCli(
        [
          "module",
          "create",
          "--blueprint-id",
          "lab-load",
          "--name",
          "Lab Load",
          "--runtime-attribute",
          "powerDrawKw=3",
        ],
        cwd,
        {
          KEPLER_BASE_URL: baseUrl,
          KEPLER_PLANET_TOKEN: "test-token",
        },
      );
      expect(createLoad.exitCode).toBe(0);

      requests.length = 0;

      const result = await runCli(["tick", "60"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Tick");
      expect(result.stdout).toContain("requestedTicks");
      expect(result.stdout).toContain("completedTicks");
      expect(result.stdout).toContain("60");
      expect(result.stdout).toContain("currentTick");
      expect(result.stdout).toContain("consumedKwh");
      expect(result.stdout).toContain("0.05");
      expect(result.stdout).toContain("storedEnergyKwh");
      expect(result.stdout).toContain("9.95");
      expect(result.stdout).toContain("solarIrradianceWPerM2");
      expect(result.stdout).toContain("solarCondition");
      expect(result.stdout).toContain("constructionCompleted");
      expect(result.stdout).toContain("false");
      expect(requests).toEqual([
        { method: "GET", pathname: "/world/solar-irradiance", body: null },
      ]);

      const simulation = readSimulationState(cwd)!;
      expect(simulation).toEqual({ currentTick: 60 });

      const modules = readModuleState(cwd)!;
      expect(modules.modules.find((module: { id: string }) => module.id === "starter-basic-battery-1")?.runtimeAttributes)
        .toMatchObject({
          currentEnergyKwh: 9.95,
          energyStorageKwh: 20,
        });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tick creates default simulation state and persists across invocations", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const first = await runCli(["tick", "1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      expect(first.exitCode).toBe(0);
      expect(first.stdout).toContain("Tick");
      expect(first.stdout).toContain("requestedTicks");
      expect(first.stdout).toContain("currentTick");
      expect(first.stdout).toContain("1");

      const second = await runCli(["tick", "2"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toContain("currentTick");
      expect(second.stdout).toContain("3");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tick rejects an invalid tick count", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["tick", "0"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Tick count must be a positive integer.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tick fails when no local habitat registration exists", async () => {
    const cwd = makeTempDir();

    try {
      const result = await runCli(["tick", "1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prints help for the Kepler-only commands", async () => {
    const cwd = makeTempDir();
    try {
      const result = await runCli(["--help"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      expect(output).toContain("Usage: habitat [options] [command]");
      expect(output).toContain("register");
      expect(output).toContain("status");
      expect(output).toContain("unregister");
      expect(output).toContain("scan");
      expect(output).not.toContain("battery");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("clock status reports manual mode before listening is enabled", async () => {
    const cwd = makeTempDir();
    try {
      const result = await runCli(["clock", "status"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Clock Status");
      expect(result.stdout).toContain("manual");
      expect(result.stdout).toContain("off");
      expect(result.stdout).toContain("manualTicksAllowed");
      expect(result.stdout).toContain("true");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("scan prints every probability and a ranged quantity estimate for one tile", async () => {
    const cwd = makeTempDir();
    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      await deployAt(cwd, 3, -2);
      const result = await runCli(["scan", "--strength", "60"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Resource Scan");
      expect(result.stdout).toContain("position");
      expect(result.stdout).toContain("3, -2");
      expect(result.stdout).toContain("sensorStrength");
      expect(result.stdout).toContain("flat");
      for (const resource of ["ferrite", "silicate-glass", "conductive-ore", "water-ice", "none"]) expect(result.stdout).toContain(resource);
      expect(result.stdout).toContain("55%");
      expect(result.stdout).toContain("180 kg (140-220 kg)");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("scan strength 100 prints an exact remaining quantity", async () => {
    const cwd = makeTempDir();
    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      await deployAt(cwd, 3, -2);
      const result = await runCli(["scan", "--strength", "100"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("100%");
      expect(result.stdout).toContain("184 kg (exact)");
      expect(result.stdout).toContain("minimumKg");
      expect(result.stdout).toContain("maximumKg");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("scan leaves quantity empty when none is the top candidate", async () => {
    const cwd = makeTempDir();
    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      await deployAt(cwd, -1, -2);
      const result = await runCli(["scan", "--strength", "60"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("topCandidate     none");
      expect(result.stdout).toContain("quantity      -");
      expect(result.stdout).not.toContain("estimatedKg");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("scan radius output summarizes every returned tile and JSON preserves the response", async () => {
    const cwd = makeTempDir();
    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      await deployAt(cwd, 3, -2);
      const summary = await runCli(["scan", "--strength", "60", "--radius", "1"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      expect(summary.exitCode).toBe(0);
      expect(summary.stdout).toContain("COORDINATES");
      expect(summary.stdout).toContain("DISTANCE");
      expect(summary.stdout).toContain("CONFIDENCE");
      expect(summary.stdout).toContain("2, -3");
      expect(summary.stdout).toContain("4, -1");

      const json = await runCli(["scan", "--strength", "60", "--radius", "1", "--json"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      const parsed = JSON.parse(json.stdout);
      expect(parsed.scan).toMatchObject({ modelVersion: "resource-probability-v2", origin: { x: 3, y: -2 }, sensorStrength: 60, radiusTiles: 1 });
      expect(parsed.scan.tiles).toHaveLength(9);
      expect(parsed.scan.tiles[0].quantityEstimate).toMatchObject({ estimatedKg: 180, minimumKg: 140, maximumKg: 220, exact: false });
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("scan rejects invalid strength and radius without a stack trace", async () => {
    const cwd = makeTempDir();
    try {
      for (const [args, message] of [
        [["scan", "--strength", "101"], "Sensor strength must be an integer from 0 through 100."],
        [["scan", "--strength", "60", "--radius", "6"], "Radius must be an integer from 0 through 5."],
      ] as const) {
        const result = await runCli([...args], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(message);
        expect(result.stderr).not.toContain("at ");
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("register persists habitat data and sends OpenAPI request keys", async () => {
    const cwd = makeTempDir();
    requests.length = 0;

    try {
      const result = await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Registration");
      expect(result.stdout).toContain("Artemis Ridge");

      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe("POST");
      expect(requests[0]?.pathname).toBe("/habitats/register");
      const requestBody = JSON.parse(requests[0]?.body ?? "{}");
      expect(requestBody.displayName).toBe("Artemis Ridge");
      expect(requestBody.habitatUuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      expect(existsSync(join(cwd, "habitat.sqlite"))).toBe(true);
      expect(existsSync(join(cwd, ".habitat"))).toBe(false);

      const registration = readRegistration(cwd)!;
      expect(registration).toMatchObject({
        habitatId: "habitat_11111111_1111_4111_8111_111111111111",
        habitatUuid: requestBody.habitatUuid,
        displayName: "Artemis Ridge",
      });

      const modules = readModuleState(cwd)!;
      expect(modules.modules).toHaveLength(6);
      expect(modules.blueprints).toHaveLength(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("status reads the persisted habitat id and prints registration status", async () => {
    const cwd = makeTempDir();
    requests.length = 0;

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      requests.length = 0;

      const result = await runCli(["status"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Habitat Status");
      expect(result.stdout).toContain("Artemis Ridge");
      expect(result.stdout).toContain("status");
      expect(result.stdout).toContain("online");
      expect(result.stdout).toContain("catalogVersion");
      expect(result.stdout).toContain("2026-06-24");
      expect(result.stdout).toContain("modules");
      expect(result.stdout).toContain("6");
      expect(result.stdout).toContain("wss://planet.turingguild.com/planet/stream");
      expect(result.stdout).toContain("habitat-stream-secret");
      expect(result.stdout).toContain("protocolVersion");
      expect(result.stdout).toContain("ticksPerPulse");
      expect(requests).toEqual([
        {
          method: "GET",
          pathname: "/habitats/habitat_11111111_1111_4111_8111_111111111111/registration",
          body: null,
        },
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("status JSON exposes stable saved stream credential fields", async () => {
    const cwd = makeTempDir();
    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      const result = await runCli(["--json", "status"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.registration).toMatchObject({ streamUrl: "wss://planet.turingguild.com/planet/stream", apiToken: "habitat-stream-secret", stream: { protocolVersion: "1.0", subscriptions: ["ticks"], currentTick: 800, tickIntervalMs: 5000, ticksPerPulse: 1, status: "running" } });
      expect(output.habitat).toMatchObject({ status: "online" });
      expect(output.modules).toBe(6);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("module list shows the hydrated starter modules", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["module", "list"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("cmd-1");
      expect(result.stdout).toContain("Command Module");
      expect(result.stdout).toContain("suit-1");
      expect(result.stdout).toContain("Basic Suitport");
      expect(result.stdout).not.toContain("starter-command-1\t");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blueprint list shows the official blueprint catalog", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["blueprint", "list"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("command-module");
      expect(result.stdout).toContain("Command Module Blueprint");
      expect(result.stdout).toContain("published");
      expect(result.stdout).not.toContain("starter-command-1");
      expect(requests).toContainEqual({
        method: "GET",
        pathname: "/catalog/blueprints",
        body: null,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("resource list shows Kepler resource types without creating local inventory", async () => {
    const cwd = makeTempDir();

    try {
      const result = await runCli(["resource", "list"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Resource Catalog");
      expect(result.stdout).toContain("catalogVersion");
      expect(result.stdout).toContain("iron-ore");
      expect(result.stdout).toContain("Iron Ore");
      expect(result.stdout).toContain("water-ice");
      expect(result.stdout).toContain("Water Ice");
      expect(result.stdout).not.toContain("inventory=");
      expect(existsSync(join(cwd, ".habitat"))).toBe(false);
      expect(requests).toContainEqual({
        method: "GET",
        pathname: "/catalog/resources",
        body: null,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blueprint show reports a friendly error when the blueprint is missing", async () => {
    const cwd = makeTempDir();

    try {
      const result = await runCli(["blueprint", "show", "missing-blueprint"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Blueprint not found: missing-blueprint");
      expect(requests).toContainEqual({
        method: "GET",
        pathname: "/catalog/blueprints/missing-blueprint",
        body: null,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blueprint show prints one blueprint by id", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["blueprint", "show", "command-module"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Blueprint");
      expect(result.stdout).toContain("command-module");
      expect(result.stdout).toContain("Command Module Blueprint");
      expect(result.stdout).toContain("buildTicks");
      expect(result.stdout).toContain("120");
      expect(result.stdout).toContain("capabilities");
      expect(result.stdout).toContain("habitat-command");
      expect(requests).toContainEqual({
        method: "GET",
        pathname: "/catalog/blueprints/command-module",
        body: null,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blueprint check reports readiness when construction requirements are met", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      await runCli(["inventory", "set", "ferrite", "90"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "silicate-glass", "45"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "conductive-ore", "18"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["module", "set-status", "fab-1", "online"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["module", "set-status", "cache-1", "online"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["blueprint", "check", "small-solar-array"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Blueprint Readiness");
      expect(result.stdout).toContain("small-solar-array");
      expect(result.stdout).toContain("published");
      expect(result.stdout).toContain("true");
      expect(result.stdout).toContain("requiredFacility");
      expect(result.stdout).toContain("workshop-fabricator");
      expect(result.stdout).toContain("requiredMaterials");
      expect(result.stdout).toContain("ferrite=90");
      expect(result.stdout).toContain("usablePower");
      expect(result.stdout).not.toContain("Issues");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blueprint check reports missing readiness requirements", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["blueprint", "check", "small-solar-array"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ready");
      expect(result.stdout).toContain("false");
      expect(result.stdout).toContain("Issues");
      expect(result.stdout).toContain("A supply cache or logistics module must be online.");
      expect(result.stdout).toContain("Insufficient local inventory");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blueprint check reports a busy construction facility", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      await runCli(["module", "update", "fab-1", "--runtime-attribute", "activeJobId=job-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "iron", "4"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "circuit", "2"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["blueprint", "check", "command-module"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ready");
      expect(result.stdout).toContain("false");
      expect(result.stdout).toContain("Required construction facility must be online and available.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("construct dry-run for small-solar-array reports readiness without changing local state", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      await runCli(["inventory", "set", "ferrite", "90"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "silicate-glass", "45"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "conductive-ore", "18"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["module", "set-status", "cache-1", "online"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const beforeModules = readModuleState(cwd);
      const beforeInventory = readInventoryState(cwd);

      const result = await runCli(["construct", "small-solar-array", "--dry-run"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const afterModules = readModuleState(cwd);
      const afterInventory = readInventoryState(cwd);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Construction Dry Run");
      expect(result.stdout).toContain("small-solar-array");
      expect(result.stdout).toContain("valid");
      expect(result.stdout).toContain("true");
      expect(result.stdout).toContain("moduleToCreate");
      expect(result.stdout).toContain("small-solar-array");
      expect(result.stdout).toContain("resourcesToSpend");
      expect(result.stdout).toContain("ferrite=90");
      expect(result.stdout).toContain("buildTicks");
      expect(result.stdout).toContain("180");
      expect(result.stdout).toContain("canStart");
      expect(afterModules).toEqual(beforeModules);
      expect(afterInventory).toEqual(beforeInventory);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("construct small-solar-array starts construction and records the job without creating the final module", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      await runCli(["inventory", "set", "ferrite", "90"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "silicate-glass", "45"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "conductive-ore", "18"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["module", "set-status", "cache-1", "online"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const beforeModules = readModuleState(cwd)!;
      const beforeInventory = readInventoryState(cwd)!;

      const result = await runCli(["construct", "small-solar-array"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Construction Started");
      expect(result.stdout).toContain("small-solar-array");
      expect(result.stdout).toContain("canStart");
      expect(result.stdout).toContain("true");
      expect(result.stdout).toContain("Construction Job");
      expect(result.stdout).toContain("outputModuleId");
      expect(result.stdout).toContain("small-solar-array-1");
      expect(result.stdout).toContain("Resources Spent");
      expect(result.stdout).toContain("ferrite");

      const modules = readModuleState(cwd)!;
      const inventory = readInventoryState(cwd)!;
      const construction = readConstructionState(cwd)!;

      expect(modules).not.toEqual(beforeModules);
      expect(inventory).not.toEqual(beforeInventory);
      expect(inventory.resources).toEqual({
        ferrite: 0,
        "silicate-glass": 0,
        "conductive-ore": 0,
      });
      expect(modules.modules.find((module: { id: string }) => module.id === "starter-workshop-fabricator-1")?.runtimeAttributes).toMatchObject({
        status: "active",
        activeJobId: "small-solar-array-1",
        busy: true,
      });
      expect(modules.modules.find((module: { id: string }) => module.id === "small-solar-array-1")).toBeUndefined();
      expect(construction.activeJob).toMatchObject({
        blueprintId: "small-solar-array",
        futureModuleId: "small-solar-array-1",
        futureModuleType: "small-solar-array",
        totalBuildTicks: 180,
        remainingBuildTicks: 180,
        facilityModuleId: "starter-workshop-fabricator-1",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("construction status reports an active job", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      await runCli(["inventory", "set", "ferrite", "90"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "silicate-glass", "45"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "conductive-ore", "18"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["module", "set-status", "cache-1", "online"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["construct", "small-solar-array"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["construction", "status"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Construction Job 1");
      expect(result.stdout).toContain("blueprintId");
      expect(result.stdout).toContain("small-solar-array");
      expect(result.stdout).toContain("outputModuleId");
      expect(result.stdout).toContain("small-solar-array-1");
      expect(result.stdout).toContain("facilityModuleId");
      expect(result.stdout).toContain("starter-workshop-fabricator-1");
      expect(result.stdout).toContain("totalBuildTicks");
      expect(result.stdout).toContain("180");
      expect(result.stdout).toContain("progress");
      expect(result.stdout).toContain("0%");
      expect(result.stdout).toContain("state");
      expect(result.stdout).toContain("active");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("construction cancel clears the job and makes the fabricator available without refunding materials", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "ferrite", "90"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      await runCli(["inventory", "set", "silicate-glass", "45"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      await runCli(["inventory", "set", "conductive-ore", "18"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      await runCli(["module", "set-status", "cache-1", "online"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });
      await runCli(["construct", "small-solar-array"], cwd, { KEPLER_BASE_URL: baseUrl, KEPLER_PLANET_TOKEN: "test-token" });

      const result = await runCli(["construction", "cancel", "fab-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Construction Cancelled");
      expect(result.stdout).toContain("materialsRefunded");
      expect(result.stdout).toContain("false");
      expect(result.stderr).toContain("spent construction materials were not refunded");

      const modules = readModuleState(cwd)!;
      const inventory = readInventoryState(cwd)!;
      const construction = readConstructionState(cwd)!;
      const facility = modules.modules.find((module: { id: string }) => module.id === "starter-workshop-fabricator-1");

      if (!facility) throw new Error("Expected the fabricator module to remain in local state");
      expect(facility.runtimeAttributes).toMatchObject({ busy: false });
      expect(facility.runtimeAttributes.activeJobId).toBeUndefined();
      expect(inventory.resources).toEqual({ ferrite: 0, "silicate-glass": 0, "conductive-ore": 0 });
      expect(construction).toEqual({ activeJob: null });
      expect(modules.modules.find((module: { id: string }) => module.id === "small-solar-array-1")).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("construction cancel rejects a facility without an active job", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      const before = readModuleState(cwd);
      const result = await runCli(["construction", "cancel", "fab-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("No active construction job found");
      expect(readModuleState(cwd)).toEqual(before);
      expect(readConstructionState(cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("construction status reports a friendly empty state", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["construction", "status"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No active construction jobs.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tick completes construction and creates the output module when the job reaches zero", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      await runCli(["inventory", "set", "ferrite", "90"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "silicate-glass", "45"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "conductive-ore", "18"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["module", "set-status", "cache-1", "online"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["construct", "small-solar-array"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["tick", "180"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("constructionCompleted");
      expect(result.stdout).toContain("true");

      const solarTick = await runCli(["tick", "1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      expect(solarTick.exitCode).toBe(0);
      expect(solarTick.stdout).toContain("generatedKwh");
      expect(solarTick.stdout).toContain("0.001667");

      const modules = readModuleState(cwd)!;
      expect(modules.modules.find((module: { id: string }) => module.id === "small-solar-array-1")).toMatchObject({
        id: "small-solar-array-1",
        blueprintId: "small-solar-array",
        displayName: "Small Solar Array",
        runtimeAttributes: expect.objectContaining({
          health: 100,
          status: "online",
          powerDrawKw: {
            offline: 0,
            online: 0,
            active: 0,
            damaged: 0,
          },
          powerGenerationKw: 12,
        }),
        capabilities: ["solar-generation"],
      });

      expect(modules.modules.find((module: { id: string }) => module.id === "starter-workshop-fabricator-1")?.runtimeAttributes).toMatchObject({
        status: "online",
        busy: false,
      });

      const construction = readConstructionState(cwd)!;
      expect(construction).toEqual({ activeJob: null });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("inventory list renders a table", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["inventory", "set", "ferrite", "90"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "silicate-glass", "45"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      await runCli(["inventory", "set", "conductive-ore", "18"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["inventory", "list"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("RESOURCE");
      expect(result.stdout).toContain("AMOUNT");
      expect(result.stdout).toContain("ferrite");
      expect(result.stdout).toContain("silicate-glass");
      expect(result.stdout).toContain("conductive-ore");
      expect(result.stdout).toContain("----------");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("inventory add and remove use the backend and preserve quantity validation", async () => {
    const cwd = makeTempDir();

    try {
      const add = await runCli(["inventory", "add", "ferrite", "12"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      expect(add.exitCode).toBe(0);
      expect(add.stdout).toContain("resourceType=ferrite");
      expect(add.stdout).toContain("quantity=12");

      const remove = await runCli(["inventory", "remove", "ferrite", "5"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      expect(remove.exitCode).toBe(0);
      expect(remove.stdout).toContain("quantity=7");

      const invalid = await runCli(["inventory", "add", "ferrite", "-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      expect(invalid.exitCode).toBe(1);
      expect(invalid.stderr).toContain("Inventory quantity must be a positive number.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("module show accepts a short alias and prints the full module details", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["module", "show", "cmd-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("FIELD");
      expect(result.stdout).toContain("alias");
      expect(result.stdout).toContain("cmd-1");
      expect(result.stdout).toContain("id");
      expect(result.stdout).toContain("starter-command-1");
      expect(result.stdout).toContain("blueprintId");
      expect(result.stdout).toContain("command-module");
      expect(result.stdout).toContain("capabilities");
      expect(result.stdout).toContain("habitat-command");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("module create update and delete manage local module state", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const createResult = await runCli(
        [
          "module",
          "create",
          "--blueprint-id",
          "sensor-mast",
          "--name",
          "Sensor Mast",
          "--connect-to",
          "starter-command-1",
          "--capability",
          "environment-sensing",
          "--runtime-attribute",
          "health=100",
          "--runtime-attribute",
          "status=online",
        ],
        cwd,
        {
          KEPLER_BASE_URL: baseUrl,
          KEPLER_PLANET_TOKEN: "test-token",
        },
      );

      expect(createResult.exitCode).toBe(0);
      expect(createResult.stdout).toContain("Created Module");
      expect(createResult.stdout).toContain("alias");
      expect(createResult.stdout).toContain("sensor-1");
      const createdIdLine = createResult.stdout
        .split("\n")
        .find((line) => line.includes("module_"));
      expect(createdIdLine ?? "").toMatch(/module_/);

      const updateResult = await runCli(
        [
          "module",
          "update",
          "sensor-1",
          "--name",
          "Sensor Mast Mk II",
          "--capability",
          "environment-sensing",
          "--capability",
          "long-range-scan",
          "--runtime-attribute",
          "health=85",
          "--runtime-attribute",
          "status=damaged",
        ],
        cwd,
        {
          KEPLER_BASE_URL: baseUrl,
          KEPLER_PLANET_TOKEN: "test-token",
        },
      );

      expect(updateResult.exitCode).toBe(0);
      expect(updateResult.stdout).toContain("Updated Module");
      expect(updateResult.stdout).toContain("sensor-1");

      const showResult = await runCli(["module", "show", "sensor-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(showResult.exitCode).toBe(0);
      expect(showResult.stdout).toContain("FIELD");
      expect(showResult.stdout).toContain("alias");
      expect(showResult.stdout).toContain("sensor-1");
      expect(showResult.stdout).toContain("displayName");
      expect(showResult.stdout).toContain("Sensor Mast Mk II");
      expect(showResult.stdout).toContain("capabilities");
      expect(showResult.stdout).toContain("environment-sensing, long-range-scan");
      expect(showResult.stdout).toContain("declaredState        damaged");

      const deleteResult = await runCli(["module", "delete", "sensor-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(deleteResult.exitCode).toBe(0);
      expect(deleteResult.stdout).toContain("Deleted Module");
      expect(deleteResult.stdout).toContain("sensor-1");

      const listResult = await runCli(["module", "list"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(listResult.exitCode).toBe(0);
      expect(listResult.stdout).not.toContain("sensor-1");
      expect(listResult.stdout).toContain("cmd-1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("unregister removes local persisted habitat files", async () => {
    const cwd = makeTempDir();

    try {
      await runCli(["register", "--name", "Artemis Ridge"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      const result = await runCli(["unregister"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Removed local habitat registration");
      expect(readRegistration(cwd)).toBeNull();
      expect(readModuleState(cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
