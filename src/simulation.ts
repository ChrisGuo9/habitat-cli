import type { KeplerStarterModule } from "./kepler";
import type { HabitatModuleState, HabitatSimulationState } from "./state";

type SimulationInput = {
  moduleState: HabitatModuleState;
  simulationState: HabitatSimulationState;
  tickCount: number;
};

type SimulationSummary = {
  ticks: number;
  consumedKwh: number;
  storedEnergyKwh: number;
};

export type SimulationResult = {
  moduleState: HabitatModuleState;
  simulationState: HabitatSimulationState;
  summary: SimulationSummary;
};

export function runSimulationTicks(input: SimulationInput): SimulationResult {
  const consumedPerTick = totalNumericAttribute(input.moduleState.modules, "powerDrawKw") / 3600;
  const consumedForBatch = roundTo(totalForBatch(consumedPerTick, input.tickCount));
  const updatedModules = input.moduleState.modules.map(cloneModule);
  const batteryIndexes = updatedModules
    .map((module, index) => (getNumericAttribute(module, "currentEnergyKwh") === null ? null : index))
    .filter((index): index is number => index !== null);

  drainEnergy(updatedModules, batteryIndexes, consumedForBatch);

  return {
    moduleState: {
      ...input.moduleState,
      modules: updatedModules,
    },
    simulationState: {
      currentTick: input.simulationState.currentTick + input.tickCount,
    },
    summary: {
      ticks: input.tickCount,
      consumedKwh: consumedForBatch,
      storedEnergyKwh: roundTo(sumStoredEnergy(updatedModules)),
    },
  };
}

function totalNumericAttribute(modules: KeplerStarterModule[], key: string): number {
  return roundTo(modules.reduce((sum, module) => sum + (getNumericAttribute(module, key) ?? 0), 0));
}

function getNumericAttribute(module: KeplerStarterModule, key: string): number | null {
  const value = module.runtimeAttributes[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cloneModule(module: KeplerStarterModule): KeplerStarterModule {
  return {
    ...module,
    connectedTo: [...module.connectedTo],
    capabilities: [...module.capabilities],
    runtimeAttributes: { ...module.runtimeAttributes },
  };
}

function drainEnergy(
  modules: KeplerStarterModule[],
  batteryIndexes: number[],
  amount: number,
): void {
  let remaining = amount;
  if (remaining <= 0) {
    return;
  }

  for (const index of batteryIndexes) {
    if (remaining <= 0) {
      break;
    }

    const module = modules[index];
    if (!module) continue;

    const current = getNumericAttribute(module, "currentEnergyKwh") ?? 0;
    const delta = Math.min(current, remaining);
    module.runtimeAttributes.currentEnergyKwh = roundTo(current - delta);
    remaining -= delta;
  }
}

function sumStoredEnergy(modules: KeplerStarterModule[]): number {
  return modules.reduce((sum, module) => sum + (getNumericAttribute(module, "currentEnergyKwh") ?? 0), 0);
}

function totalForBatch(perTick: number, tickCount: number): number {
  return perTick * tickCount;
}

function roundTo(value: number): number {
  return Number(value.toFixed(6));
}
