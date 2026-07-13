import type { KeplerStarterModule } from "./kepler";
import type {
  HabitatConstructionJob,
  HabitatConstructionState,
  HabitatModuleState,
  HabitatSimulationState,
} from "./state";

type SimulationInput = {
  moduleState: HabitatModuleState;
  simulationState: HabitatSimulationState;
  tickCount: number;
  solarIrradianceWPerM2?: number;
  constructionState?: HabitatConstructionState | null;
};

type SimulationSummary = {
  requestedTicks: number;
  completedTicks: number;
  blockedTicks: number;
  powerBlockedTicks: number;
  consumedKwh: number;
  generatedKwh: number;
  storedEnergyKwh: number;
  constructionCompleted: boolean;
};

export type SimulationResult = {
  moduleState: HabitatModuleState;
  simulationState: HabitatSimulationState;
  constructionState: HabitatConstructionState;
  summary: SimulationSummary;
};

export function runSimulationTicks(input: SimulationInput): SimulationResult {
  const modules = input.moduleState.modules.map(cloneModule);
  const activeJob = input.constructionState?.activeJob ? cloneJob(input.constructionState.activeJob) : null;
  const tickOutcome = runTickLoop(modules, activeJob, input.tickCount, input.solarIrradianceWPerM2 ?? 0);

  return {
    moduleState: {
      ...input.moduleState,
      modules: tickOutcome.modules,
    },
    simulationState: {
      currentTick: input.simulationState.currentTick + input.tickCount,
    },
    constructionState: {
      activeJob: tickOutcome.constructionJob,
    },
    summary: {
      requestedTicks: input.tickCount,
      completedTicks: tickOutcome.completedTicks,
      blockedTicks: tickOutcome.blockedTicks,
      powerBlockedTicks: tickOutcome.powerBlockedTicks,
      consumedKwh: roundTo(tickOutcome.consumedKwh),
      generatedKwh: roundTo(tickOutcome.generatedKwh),
      storedEnergyKwh: roundTo(sumStoredEnergy(tickOutcome.modules)),
      constructionCompleted: tickOutcome.constructionCompleted,
    },
  };
}

type TickLoopResult = {
  modules: KeplerStarterModule[];
  constructionJob: HabitatConstructionJob | null;
  completedTicks: number;
  blockedTicks: number;
  powerBlockedTicks: number;
  consumedKwh: number;
  generatedKwh: number;
  constructionCompleted: boolean;
};

function runTickLoop(
  modules: KeplerStarterModule[],
  constructionJob: HabitatConstructionJob | null,
  tickCount: number,
  solarIrradianceWPerM2: number,
): TickLoopResult {
  let currentJob = constructionJob;
  let completedTicks = 0;
  let blockedTicks = 0;
  let powerBlockedTicks = 0;
  let consumedKwh = 0;
  let generatedKwh = 0;
  let constructionCompleted = false;

  for (let i = 0; i < tickCount; i += 1) {
    const tickConsumption = totalPowerDrawKw(modules) / 3600;
    const powered = hasUsablePower(modules);
    const batteryIndexes = batteryModuleIndexes(modules);
    const activeJob = currentJob;

    const tickGeneration = generateSolarEnergy(modules, batteryIndexes, solarIrradianceWPerM2);
    generatedKwh += tickGeneration;
    drainEnergy(modules, batteryIndexes, tickConsumption);
    consumedKwh += tickConsumption;
    completedTicks += 1;

    const constructionProgressed =
      activeJob !== null &&
      powered &&
      isEffectivelyOnline(modules, activeJob.facilityModuleId);

    if (constructionProgressed) {
      activeJob.remainingBuildTicks = Math.max(0, activeJob.remainingBuildTicks - 1);

      if (activeJob.remainingBuildTicks === 0) {
        completeConstructionJob(modules, activeJob);
        currentJob = null;
        constructionCompleted = true;
      }
    } else if (activeJob !== null) {
      blockedTicks += 1;
      if (!powered) {
        powerBlockedTicks += 1;
      }
    }
  }

  normalizeEnergyValues(modules);

  return {
    modules,
    constructionJob: currentJob,
    completedTicks,
    blockedTicks,
    powerBlockedTicks,
    consumedKwh,
    generatedKwh,
    constructionCompleted,
  };
}

function generateSolarEnergy(
  modules: KeplerStarterModule[],
  batteryIndexes: number[],
  solarIrradianceWPerM2: number,
): number {
  if (solarIrradianceWPerM2 <= 0) return 0;

  const multiplier = solarIrradianceWPerM2 / 900;
  let remaining = 0;
  for (const module of modules) {
    if (!module.capabilities.includes("solar-generation") || !isEffectivelyOnline([module], module.id)) continue;
    remaining += (getNumericAttribute(module, "powerGenerationKw") ?? 0) * multiplier * 0.5 / 3600;
  }

  let stored = 0;
  for (const index of batteryIndexes) {
    const battery = modules[index];
    if (!battery) continue;
    const current = getNumericAttribute(battery, "currentEnergyKwh") ?? 0;
    const capacity = getNumericAttribute(battery, "energyStorageKwh") ?? Number.POSITIVE_INFINITY;
    const delta = Math.min(remaining, Math.max(0, capacity - current));
    battery.runtimeAttributes.currentEnergyKwh = current + delta;
    remaining -= delta;
    stored += delta;
    if (remaining <= 0) break;
  }

  return stored;
}

function totalPowerDrawKw(modules: KeplerStarterModule[]): number {
  return roundTo(modules.reduce((sum, module) => sum + (getNumericAttribute(module, "powerDrawKw") ?? 0), 0));
}

function hasUsablePower(modules: KeplerStarterModule[]): boolean {
  return sumStoredEnergy(modules) > 0;
}

function batteryModuleIndexes(modules: KeplerStarterModule[]): number[] {
  return modules
    .map((module, index) => (getNumericAttribute(module, "currentEnergyKwh") === null ? null : index))
    .filter((index): index is number => index !== null);
}

function isEffectivelyOnline(modules: KeplerStarterModule[], moduleId: string): boolean {
  const module = modules.find((entry) => entry.id === moduleId);
  if (!module) return false;

  const status = getStatus(module);
  return status === "online" || status === "active" || status === "idle";
}

function getStatus(module: KeplerStarterModule): string {
  const status = module.runtimeAttributes.status;
  return typeof status === "string" ? status : "idle";
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

function cloneJob(job: HabitatConstructionJob): HabitatConstructionJob {
  return {
    ...job,
    futureRuntimeAttributes: { ...job.futureRuntimeAttributes },
    futureCapabilities: [...job.futureCapabilities],
    requiredMaterials: { ...job.requiredMaterials },
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
    module.runtimeAttributes.currentEnergyKwh = current - delta;
    remaining -= delta;
  }
}

function completeConstructionJob(
  modules: KeplerStarterModule[],
  job: HabitatConstructionJob,
): void {
  const completedModule: KeplerStarterModule = {
    id: job.futureModuleId,
    blueprintId: job.futureModuleType,
    displayName: job.futureModuleDisplayName,
    connectedTo: [],
    runtimeAttributes: {
      ...job.futureRuntimeAttributes,
      status: normalizeCompletionStatus(job.futureRuntimeAttributes.status),
    },
    capabilities: [...job.futureCapabilities],
  };

  const existingIndex = modules.findIndex((module) => module.id === job.futureModuleId);
  if (existingIndex === -1) {
    modules.push(completedModule);
  } else {
    modules[existingIndex] = completedModule;
  }

  const facilityIndex = modules.findIndex((module) => module.id === job.facilityModuleId);
  if (facilityIndex !== -1) {
    const facility = modules[facilityIndex]!;
    const { activeJobId: _activeJobId, ...runtimeAttributes } = facility.runtimeAttributes;
    modules[facilityIndex] = {
      ...facility,
      runtimeAttributes: {
        ...runtimeAttributes,
        status: "online",
        busy: false,
      },
    };
  }
}

function normalizeCompletionStatus(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "online";
}

function sumStoredEnergy(modules: KeplerStarterModule[]): number {
  return modules.reduce((sum, module) => sum + (getNumericAttribute(module, "currentEnergyKwh") ?? 0), 0);
}

function normalizeEnergyValues(modules: KeplerStarterModule[]): void {
  for (const module of modules) {
    const currentEnergy = getNumericAttribute(module, "currentEnergyKwh");
    if (currentEnergy !== null) {
      module.runtimeAttributes.currentEnergyKwh = roundTo(currentEnergy);
    }
  }
}

function roundTo(value: number): number {
  return Number(value.toFixed(6));
}
