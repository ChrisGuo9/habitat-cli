import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createModule,
  deleteModule,
  getModule,
  hydrateModulesFromRegistration,
  listModules,
  readModuleState,
  readRegistration,
  readConstructionState,
  readClockState,
  removeModuleState,
  readInventoryState,
  removeRegistration,
  removeInventoryState,
  removeConstructionState,
  removeClockState,
  updateModule,
  writeInventoryState,
  writeConstructionState,
  writeClockState,
  writeModuleState,
  writeRegistration,
} from "./state";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-state-"));
}

describe("habitat state", () => {
  test("persists registration details in habitat.sqlite without creating JSON state", () => {
    const cwd = makeTempDir();

    try {
      writeRegistration(
        {
          habitatId: "habitat-123",
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "KEPLER_PLANET_TOKEN",
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
        },
        cwd,
      );

      expect(readRegistration(cwd)).toEqual({
        habitatId: "habitat-123",
        habitatUuid: "11111111-1111-4111-8111-111111111111",
        displayName: "Artemis Ridge",
        baseUrl: "https://planet.turingguild.com",
        tokenSource: "KEPLER_PLANET_TOKEN",
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
      });
      expect(existsSync(join(cwd, "habitat.sqlite"))).toBe(true);
      expect(existsSync(join(cwd, ".habitat", "registration.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("defaults legacy habitats to manual clock mode and persists clock observations", () => {
    const cwd = makeTempDir();

    try {
      expect(readClockState(cwd)).toEqual({
        mode: "manual",
        connectionState: "disconnected",
        lastKeplerTick: null,
        lastAdvancedBy: null,
        lastConnectedAt: null,
        lastMessageAt: null,
        lastConnectionError: null,
      });

      writeClockState(
        {
          mode: "kepler",
          connectionState: "connected",
          lastKeplerTick: 900,
          lastAdvancedBy: 100,
          lastConnectedAt: "2026-07-17T12:00:00.000Z",
          lastMessageAt: "2026-07-17T12:01:00.000Z",
          lastConnectionError: null,
        },
        cwd,
      );

      expect(readClockState(cwd)).toEqual({
        mode: "kepler",
        connectionState: "connected",
        lastKeplerTick: 900,
        lastAdvancedBy: 100,
        lastConnectedAt: "2026-07-17T12:00:00.000Z",
        lastMessageAt: "2026-07-17T12:01:00.000Z",
        lastConnectionError: null,
      });

      removeClockState(cwd);
      expect(readClockState(cwd).mode).toBe("manual");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("hydrates starter modules and blueprints for local persistence", () => {
    const state = hydrateModulesFromRegistration(
      [
        {
          id: "starter-command-1",
          blueprintId: "command-module",
          displayName: "Command Module",
          connectedTo: [],
          runtimeAttributes: { health: 100 },
          capabilities: ["habitat-command"],
        },
      ],
      [
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
        },
      ],
    );

    expect(state.modules).toHaveLength(1);
    expect(state.modules[0]?.id).toBe("starter-command-1");
    expect(state.blueprints).toHaveLength(1);
    expect(state.blueprints[0]?.blueprintId).toBe("command-module");
  });

  test("lists and shows persisted modules", () => {
    const cwd = makeTempDir();

    try {
      writeModuleState(
        hydrateModulesFromRegistration(
          [
            {
              id: "starter-command-1",
              blueprintId: "command-module",
              displayName: "Command Module",
              connectedTo: [],
              runtimeAttributes: { health: 100 },
              capabilities: ["habitat-command"],
            },
            {
              id: "starter-life-support-1",
              blueprintId: "life-support",
              displayName: "Life Support",
              connectedTo: ["starter-command-1"],
              runtimeAttributes: { health: 100 },
              capabilities: ["atmosphere-control"],
            },
          ],
          [],
        ),
        cwd,
      );

      expect(listModules(cwd)).toHaveLength(2);
      expect(getModule("starter-life-support-1", cwd)?.blueprintId).toBe("life-support");
      expect(getModule("missing-id", cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates updates and deletes local modules", () => {
    const cwd = makeTempDir();

    try {
      writeModuleState(hydrateModulesFromRegistration([], []), cwd);

      const created = createModule(
        {
          blueprintId: "sensor-mast",
          displayName: "Sensor Mast",
          connectedTo: ["starter-command-1"],
          runtimeAttributes: { health: 100, status: "online" },
          capabilities: ["environment-sensing"],
        },
        cwd,
      );

      expect(created.id).toMatch(/^module_/);
      expect(listModules(cwd)).toHaveLength(1);

      const updated = updateModule(
        created.id,
        {
          displayName: "Upgraded Sensor Mast",
          runtimeAttributes: { health: 85, status: "damaged" },
          capabilities: ["environment-sensing", "long-range-scan"],
        },
        cwd,
      );

      expect(updated?.displayName).toBe("Upgraded Sensor Mast");
      expect(updated?.runtimeAttributes).toEqual({ health: 85, status: "damaged" });
      expect(updated?.capabilities).toEqual(["environment-sensing", "long-range-scan"]);

      expect(deleteModule(created.id, cwd)).toBe(true);
      expect(listModules(cwd)).toHaveLength(0);
      expect(deleteModule("missing-id", cwd)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("removes local persisted habitat files", () => {
    const cwd = makeTempDir();

    try {
      writeRegistration(
        {
          habitatId: "habitat-123",
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "KEPLER_PLANET_TOKEN",
        },
        cwd,
      );

      removeRegistration(cwd);
      removeModuleState(cwd);

      expect(readRegistration(cwd)).toBeNull();
      expect(readModuleState(cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("persists local inventory state in SQLite", () => {
    const cwd = makeTempDir();

    try {
      writeInventoryState(
        {
          resources: {
            iron: 5,
            circuit: 2,
          },
        },
        cwd,
      );

      expect(readInventoryState(cwd)).toEqual({
        resources: {
          iron: 5,
          circuit: 2,
        },
      });

      removeInventoryState(cwd);
      expect(readInventoryState(cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("persists local construction state in SQLite", () => {
    const cwd = makeTempDir();

    try {
      writeConstructionState(
        {
          activeJob: {
            blueprintId: "small-solar-array",
            futureModuleId: "small-solar-array-1",
            futureModuleType: "small-solar-array",
            futureModuleDisplayName: "Small Solar Array",
            facilityModuleId: "starter-workshop-fabricator-1",
            totalBuildTicks: 180,
            remainingBuildTicks: 180,
            futureRuntimeAttributes: { health: 100 },
            futureCapabilities: ["solar-generation"],
            requiredMaterials: { ferrite: 90 },
          },
        },
        cwd,
      );

      expect(readConstructionState(cwd)).toEqual({
        activeJob: {
          blueprintId: "small-solar-array",
          futureModuleId: "small-solar-array-1",
          futureModuleType: "small-solar-array",
          futureModuleDisplayName: "Small Solar Array",
          facilityModuleId: "starter-workshop-fabricator-1",
          totalBuildTicks: 180,
          remainingBuildTicks: 180,
          futureRuntimeAttributes: { health: 100 },
          futureCapabilities: ["solar-generation"],
          requiredMaterials: { ferrite: 90 },
        },
      });

      removeConstructionState(cwd);
      expect(readConstructionState(cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
