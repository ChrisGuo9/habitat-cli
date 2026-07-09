import { describe, expect, test } from "bun:test";
import type { HabitatModuleState, HabitatSimulationState } from "./state";
import { runSimulationTicks } from "./simulation";

function makeState(modules: HabitatModuleState["modules"]): HabitatModuleState {
  return {
    modules,
    blueprints: [],
  };
}

describe("runSimulationTicks", () => {
  test("drains battery energy from module power demand and advances currentTick", () => {
    const result = runSimulationTicks({
      moduleState: makeState([
        {
          id: "battery-a",
          blueprintId: "basic-battery",
          displayName: "Battery A",
          connectedTo: [],
          runtimeAttributes: {
            currentEnergyKwh: 10,
            energyStorageKwh: 20,
          },
          capabilities: ["power-storage"],
        },
        {
          id: "load-a",
          blueprintId: "lab-load",
          displayName: "Load A",
          connectedTo: [],
          runtimeAttributes: {
            powerDrawKw: 3,
          },
          capabilities: [],
        },
      ]),
      simulationState: { currentTick: 0 },
      tickCount: 60,
    });

    expect(result.simulationState).toEqual({ currentTick: 60 });
    expect(result.summary.consumedKwh).toBe(0.05);
    expect(result.summary.storedEnergyKwh).toBe(9.95);
    expect(result.moduleState.modules[0]?.runtimeAttributes).toMatchObject({
      currentEnergyKwh: 9.95,
      energyStorageKwh: 20,
    });
  });

  test("clamps battery charge at zero across multiple batteries in module order", () => {
    const result = runSimulationTicks({
      moduleState: makeState([
        {
          id: "battery-a",
          blueprintId: "basic-battery",
          displayName: "Battery A",
          connectedTo: [],
          runtimeAttributes: {
            currentEnergyKwh: 1,
            energyStorageKwh: 1,
          },
          capabilities: ["power-storage"],
        },
        {
          id: "battery-b",
          blueprintId: "basic-battery",
          displayName: "Battery B",
          connectedTo: [],
          runtimeAttributes: {
            currentEnergyKwh: 2,
            energyStorageKwh: 3,
          },
          capabilities: ["power-storage"],
        },
        {
          id: "load-a",
          blueprintId: "lab-load",
          displayName: "Load A",
          connectedTo: [],
          runtimeAttributes: {
            powerDrawKw: 18000,
          },
          capabilities: [],
        },
      ]),
      simulationState: { currentTick: 5 } satisfies HabitatSimulationState,
      tickCount: 2,
    });

    expect(result.simulationState).toEqual({ currentTick: 7 });
    expect(result.summary.consumedKwh).toBe(10);
    expect(result.summary.storedEnergyKwh).toBe(0);
    expect(result.moduleState.modules[0]?.runtimeAttributes).toMatchObject({
      currentEnergyKwh: 0,
      energyStorageKwh: 1,
    });
    expect(result.moduleState.modules[1]?.runtimeAttributes).toMatchObject({
      currentEnergyKwh: 0,
      energyStorageKwh: 3,
    });
  });
});
