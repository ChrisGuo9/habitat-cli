import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cliPath = resolve(import.meta.dir, "index.ts");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-cli-"));
}

async function runCli(args: string[], cwd: string, env: Record<string, string>) {
  const child = Bun.spawn({
    cmd: ["bun", "run", cliPath, ...args],
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { stdout, stderr, exitCode };
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
                  runtimeAttributes: { crewCapacity: 2 },
                  capabilities: ["habitat-command"],
                },
              ],
            },
            { status: 201 },
          );
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

      const before = JSON.parse(readFileSync(join(cwd, ".habitat", "modules.json"), "utf8"));
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
      expect(result.stdout).toContain("moduleId=battery-1");
      expect(result.stdout).toContain("status=online");
      expect(result.stdout).toContain("powerDrawKw=0.5");

      const after = JSON.parse(readFileSync(join(cwd, ".habitat", "modules.json"), "utf8"));
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
      expect(result.stdout).toContain("ticks=60");
      expect(result.stdout).toContain("currentTick=60");
      expect(result.stdout).toContain("consumedKwh=0.05");
      expect(result.stdout).toContain("storedEnergyKwh=9.95");
      expect(requests).toEqual([]);

      const simulation = JSON.parse(readFileSync(join(cwd, ".habitat", "simulation.json"), "utf8"));
      expect(simulation).toEqual({ currentTick: 60 });

      const modules = JSON.parse(readFileSync(join(cwd, ".habitat", "modules.json"), "utf8"));
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
      expect(first.stdout).toContain("currentTick=1");

      const second = await runCli(["tick", "2"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toContain("currentTick=3");
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
      expect(output).not.toContain("battery");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
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
      expect(result.stdout).toContain("Registered habitat Artemis Ridge");

      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe("POST");
      expect(requests[0]?.pathname).toBe("/habitats/register");
      const requestBody = JSON.parse(requests[0]?.body ?? "{}");
      expect(requestBody.displayName).toBe("Artemis Ridge");
      expect(requestBody.habitatUuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const registrationPath = join(cwd, ".habitat", "registration.json");
      const modulesPath = join(cwd, ".habitat", "modules.json");

      expect(existsSync(registrationPath)).toBe(true);
      expect(existsSync(modulesPath)).toBe(true);

      const registration = JSON.parse(readFileSync(registrationPath, "utf8"));
      expect(registration).toMatchObject({
        habitatId: "habitat_11111111_1111_4111_8111_111111111111",
        habitatUuid: requestBody.habitatUuid,
        displayName: "Artemis Ridge",
      });

      const modules = JSON.parse(readFileSync(modulesPath, "utf8"));
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
      expect(result.stdout).toContain("Artemis Ridge");
      expect(result.stdout).toContain("status=online");
      expect(result.stdout).toContain("catalogVersion=2026-06-24");
      expect(result.stdout).toContain("modules=6");
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
      expect(result.stdout).toContain("alias=cmd-1");
      expect(result.stdout).toContain("id=starter-command-1");
      expect(result.stdout).toContain("blueprintId=command-module");
      expect(result.stdout).toContain('capabilities=["habitat-command"]');
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
      expect(createResult.stdout).toContain("Created local module");
      expect(createResult.stdout).toContain("alias=sensor-1");
      const createdIdLine = createResult.stdout
        .split("\n")
        .find((line) => line.startsWith("id="));
      const createdId = createdIdLine?.replace("id=", "").trim() ?? "";
      expect(createdId).toMatch(/^module_/);

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
      expect(updateResult.stdout).toContain("Updated local module sensor-1");

      const showResult = await runCli(["module", "show", "sensor-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(showResult.exitCode).toBe(0);
      expect(showResult.stdout).toContain("alias=sensor-1");
      expect(showResult.stdout).toContain("displayName=Sensor Mast Mk II");
      expect(showResult.stdout).toContain('capabilities=["environment-sensing","long-range-scan"]');
      expect(showResult.stdout).toContain('runtimeAttributes={"health":85,"status":"damaged"}');

      const deleteResult = await runCli(["module", "delete", "sensor-1"], cwd, {
        KEPLER_BASE_URL: baseUrl,
        KEPLER_PLANET_TOKEN: "test-token",
      });

      expect(deleteResult.exitCode).toBe(0);
      expect(deleteResult.stdout).toContain("Deleted local module sensor-1");

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
      expect(existsSync(join(cwd, ".habitat", "registration.json"))).toBe(false);
      expect(existsSync(join(cwd, ".habitat", "modules.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
