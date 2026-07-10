import type { KeplerBlueprint, KeplerStarterModule } from "./kepler";
import type {
  HabitatConstructionJob,
  HabitatConstructionState,
  HabitatInventoryState,
  HabitatModuleState,
} from "./state";
import { resolveModuleState } from "./module-status";

export type BlueprintConstructionRequirement = {
  blueprintId: string;
  displayName: string;
  published: boolean;
  buildable: boolean;
  requiredFacility: string[];
  requiredCapabilities: string[];
  requiredPrerequisites: string[];
  requiredMaterials: Record<string, number>;
  usablePower: boolean;
};

export type BlueprintConstructionCheck = {
  blueprint: KeplerBlueprint;
  requirement: BlueprintConstructionRequirement;
  ready: boolean;
  issues: string[];
};

export type ConstructionDryRunReport = {
  blueprintId: string;
  displayName: string;
  valid: boolean;
  published: boolean;
  buildable: boolean;
  requiredFacilityExists: boolean;
  facilityOnline: boolean;
  facilityAvailable: boolean;
  supplyCacheOnline: boolean;
  prerequisitesMet: boolean;
  inventorySufficient: boolean;
  buildTicks: number;
  moduleToCreate: {
    itemType?: string;
    moduleType?: string;
    quantity?: number;
  };
  resourcesToSpend: Record<string, number>;
  canStart: boolean;
  reasons: string[];
};

export type ConstructionStartResult = {
  moduleState: HabitatModuleState;
  inventoryState: HabitatInventoryState;
  constructionState: HabitatConstructionState;
  report: ConstructionDryRunReport;
};

export type ConstructionCancellationResult = {
  moduleState: HabitatModuleState;
  constructionState: HabitatConstructionState;
  job: HabitatConstructionJob;
};

const DEFAULT_FACILITY_BLUEPRINT_IDS = new Set(["workshop-fabricator"]);
const DEFAULT_FACILITY_CAPABILITIES = new Set(["construction", "fabrication", "logistics"]);
const DEFAULT_LOGISTICS_BLUEPRINT_IDS = new Set(["supply-cache"]);
const DEFAULT_LOGISTICS_CAPABILITIES = new Set(["logistics", "storage"]);

export function buildConstructionRequirement(
  blueprint: KeplerBlueprint,
): BlueprintConstructionRequirement {
  const requiredFacility = normalizeStringList(flattenRequirementList(blueprint.requiredFacility));
  const requiredCapabilities = normalizeStringList(flattenRequirementList(blueprint.facilityLevel ?? blueprint.target));
  const requiredPrerequisites = normalizeStringList(blueprint.prerequisites ?? []);
  const requiredMaterials = normalizeMaterialRequirements(blueprint.inputs);

  return {
    blueprintId: blueprint.blueprintId,
    displayName: blueprint.displayName,
    published: blueprint.status === "published",
    buildable: blueprint.status === "published" && blueprint.buildTicks > 0,
    requiredFacility,
    requiredCapabilities,
    requiredPrerequisites,
    requiredMaterials,
    usablePower: true,
  };
}

export function evaluateConstructionReadiness(
  blueprint: KeplerBlueprint,
  modules: KeplerStarterModule[],
  inventory: HabitatInventoryState,
): BlueprintConstructionCheck {
  const requirement = buildConstructionRequirement(blueprint);
  const issues: string[] = [];

  if (!requirement.published) {
    issues.push("Blueprint must be published.");
  }

  if (!requirement.buildable) {
    issues.push("Blueprint must describe something buildable.");
  }

  const facilityModules = findConstructionFacilities(modules);
  if (facilityModules.length === 0) {
    issues.push("Required construction facility is missing.");
  } else if (!facilityModules.some((module) => isOnline(module) && isAvailable(module))) {
    issues.push("Required construction facility must be online and available.");
  }

  const logisticsReady = findLogisticsModules(modules).some((module) => isOnline(module));
  if (!logisticsReady) {
    issues.push("A supply cache or logistics module must be online.");
  }

  const missingPrerequisites = requirement.requiredPrerequisites.filter((blueprintId) => {
    return !modules.some((module) => module.blueprintId === blueprintId);
  });
  if (missingPrerequisites.length > 0) {
    issues.push(`Missing prerequisite modules: ${missingPrerequisites.join(", ")}.`);
  }

  const missingCapabilities = requirement.requiredCapabilities.filter((capability) => {
    return !modules.some((module) => module.capabilities.includes(capability));
  });
  if (missingCapabilities.length > 0) {
    issues.push(`Missing prerequisite capabilities: ${missingCapabilities.join(", ")}.`);
  }

  const missingMaterials = getMissingMaterials(requirement.requiredMaterials, inventory);
  if (missingMaterials.length > 0) {
    issues.push(
      `Insufficient local inventory: ${missingMaterials.map(({ resourceType, missing }) => `${resourceType} (${missing} missing)`).join(", ")}.`,
    );
  }

  requirement.usablePower = hasUsablePower(modules);
  if (!requirement.usablePower) {
    issues.push("Habitat must have usable power for construction to advance during ticks.");
  }

  return {
    blueprint,
    requirement,
    ready: issues.length === 0,
    issues,
  };
}

export function runConstructionDryRun(
  blueprint: KeplerBlueprint,
  modules: KeplerStarterModule[],
  inventory: HabitatInventoryState,
): ConstructionDryRunReport {
  const requirement = buildConstructionRequirement(blueprint);
  const facilityModules = findConstructionFacilities(modules);
  const logisticsModules = findLogisticsModules(modules);
  const requiredMaterials = requirement.requiredMaterials;
  const missingMaterials = getMissingMaterials(requiredMaterials, inventory);
  const prerequisitesMet = requirement.requiredPrerequisites.every((blueprintId) => {
    return modules.some((module) => module.blueprintId === blueprintId);
  });
  const capabilitiesMet = requirement.requiredCapabilities.every((capability) => {
    return modules.some((module) => module.capabilities.includes(capability));
  });
  const inventorySufficient = missingMaterials.length === 0;
  const facilityExists = facilityModules.length > 0;
  const facilityOnline = facilityModules.some((module) => isOnline(module));
  const facilityAvailable = facilityModules.some((module) => isOnline(module) && isAvailable(module));
  const supplyCacheOnline = logisticsModules.some((module) => isOnline(module));
  const valid = requirement.published && requirement.buildable;
  const canStart =
    valid &&
    facilityExists &&
    facilityOnline &&
    facilityAvailable &&
    supplyCacheOnline &&
    prerequisitesMet &&
    capabilitiesMet &&
    inventorySufficient;

  return {
    blueprintId: blueprint.blueprintId,
    displayName: blueprint.displayName,
    valid,
    published: requirement.published,
    buildable: requirement.buildable,
    requiredFacilityExists: facilityExists,
    facilityOnline,
    facilityAvailable,
    supplyCacheOnline,
    prerequisitesMet: prerequisitesMet && capabilitiesMet,
    inventorySufficient,
    buildTicks: blueprint.buildTicks,
    moduleToCreate: extractOutputModule(blueprint),
    resourcesToSpend: requiredMaterials,
    canStart,
    reasons: buildDryRunReasons({
      requirement,
      facilityExists,
      facilityOnline,
      facilityAvailable,
      supplyCacheOnline,
      prerequisitesMet,
      capabilitiesMet,
      inventorySufficient,
    }),
  };
}

export function startConstruction(
  blueprint: KeplerBlueprint,
  moduleState: HabitatModuleState,
  inventory: HabitatInventoryState,
  constructionState: HabitatConstructionState | null,
): ConstructionStartResult {
  if (constructionState?.activeJob) {
    throw new Error(
      `Construction is already active on facility: ${constructionState.activeJob.facilityModuleId}. Cancel it or wait for completion.`,
    );
  }

  const report = runConstructionDryRun(blueprint, moduleState.modules, inventory);
  if (!report.canStart) {
    throw new Error(report.reasons.join(" "));
  }

  const facility = findConstructionFacilities(moduleState.modules).find((module) => isOnline(module) && isAvailable(module));
  if (!facility) {
    throw new Error("Required construction facility is unavailable.");
  }

  const futureModuleId = nextFutureModuleId(blueprint.blueprintId, moduleState.modules);
  const futureModuleType = report.moduleToCreate.moduleType ?? blueprint.blueprintId;
  const futureModuleDisplayName = blueprint.displayName.replace(/Blueprint$/, "").trim() || blueprint.displayName;

  const updatedModules = moduleState.modules.map((module) => {
    if (module.id !== facility.id) {
      return cloneModule(module);
    }

    return {
      ...cloneModule(module),
      runtimeAttributes: {
        ...module.runtimeAttributes,
        status: "active",
        activeJobId: futureModuleId,
        busy: true,
      },
    };
  });

  const updatedInventory: HabitatInventoryState = {
    resources: subtractMaterials(inventory.resources, report.resourcesToSpend),
  };

  const constructionJob: HabitatConstructionJob = {
    blueprintId: blueprint.blueprintId,
    futureModuleId,
    futureModuleType,
    futureModuleDisplayName,
    facilityModuleId: facility.id,
    totalBuildTicks: blueprint.buildTicks,
    remainingBuildTicks: blueprint.buildTicks,
    futureRuntimeAttributes: blueprint.runtimeAttributes ?? {},
    futureCapabilities: blueprint.capabilities ?? [],
    requiredMaterials: report.resourcesToSpend,
  };

  return {
    moduleState: {
      ...moduleState,
      modules: updatedModules,
    },
    inventoryState: updatedInventory,
    constructionState: {
      activeJob: constructionJob,
    },
    report,
  };
}

export function cancelConstruction(
  moduleState: HabitatModuleState,
  constructionState: HabitatConstructionState | null,
  facilityModuleId: string,
): ConstructionCancellationResult {
  const job = constructionState?.activeJob ?? null;
  if (!job || job.facilityModuleId !== facilityModuleId) {
    throw new Error(`No active construction job found on facility: ${facilityModuleId}`);
  }

  const facility = moduleState.modules.find((module) => module.id === facilityModuleId);
  if (!facility) {
    throw new Error(`Local module not found: ${facilityModuleId}`);
  }

  const updatedModules = moduleState.modules.map((module) => {
    if (module.id !== facilityModuleId) {
      return cloneModule(module);
    }

    const { activeJobId: _activeJobId, ...runtimeAttributes } = module.runtimeAttributes;
    return {
      ...cloneModule(module),
      runtimeAttributes: {
        ...runtimeAttributes,
        busy: false,
      },
    };
  });

  return {
    moduleState: {
      ...moduleState,
      modules: updatedModules,
    },
    constructionState: {
      activeJob: null,
    },
    job,
  };
}

function findConstructionFacilities(modules: KeplerStarterModule[]): KeplerStarterModule[] {
  return modules.filter((module) => {
    const requiredType = normalizeBlueprintModuleType(module);
    const isKnownFacility =
      DEFAULT_FACILITY_BLUEPRINT_IDS.has(requiredType) ||
      module.capabilities.some((capability) => DEFAULT_FACILITY_CAPABILITIES.has(capability)) ||
      module.capabilities.includes("construction-facility");

    return isKnownFacility;
  });
}

function findLogisticsModules(modules: KeplerStarterModule[]): KeplerStarterModule[] {
  return modules.filter((module) => {
    return (
      DEFAULT_LOGISTICS_BLUEPRINT_IDS.has(module.blueprintId) ||
      module.capabilities.some((capability) => DEFAULT_LOGISTICS_CAPABILITIES.has(capability))
    );
  });
}

function isOnline(module: KeplerStarterModule): boolean {
  const state = resolveModuleState(module.runtimeAttributes.status);
  return state === "online" || state === "active" || state === "idle";
}

function isAvailable(module: KeplerStarterModule): boolean {
  const busy = Boolean(module.runtimeAttributes.activeJobId || module.runtimeAttributes.busy === true);
  return !busy;
}

function hasUsablePower(modules: KeplerStarterModule[]): boolean {
  const storedEnergy = modules.reduce((sum, module) => {
    const energy = module.runtimeAttributes.currentEnergyKwh;
    return sum + (typeof energy === "number" && Number.isFinite(energy) ? energy : 0);
  }, 0);

  return storedEnergy > 0;
}

function getMissingMaterials(
  requiredMaterials: Record<string, number>,
  inventory: HabitatInventoryState,
): Array<{ resourceType: string; missing: number }> {
  const missing: Array<{ resourceType: string; missing: number }> = [];

  for (const [resourceType, requiredAmount] of Object.entries(requiredMaterials)) {
    const available = inventory.resources[resourceType] ?? 0;
    if (available < requiredAmount) {
      missing.push({ resourceType, missing: roundTo(requiredAmount - available) });
    }
  }

  return missing;
}

function extractOutputModule(blueprint: KeplerBlueprint): {
  itemType?: string;
  moduleType?: string;
  quantity?: number;
} {
  const output = blueprint.output;
  if (!output || typeof output !== "object") return {};

  return {
    itemType: getStringProperty(output, "itemType"),
    moduleType: getStringProperty(output, "moduleType"),
    quantity: getNumberProperty(output, "quantity") ?? undefined,
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function flattenRequirementList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRequirementList(item));
  }

  if (typeof value === "string") {
    return [value];
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => flattenRequirementList(item));
  }

  return [];
}

function normalizeMaterialRequirements(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries = Object.entries(value).flatMap(([resourceType, amount]) => {
    const numeric = typeof amount === "number" && Number.isFinite(amount) ? amount : null;
    return numeric && numeric > 0 ? [[resourceType, numeric] as const] : [];
  });

  return Object.fromEntries(entries);
}

function normalizeBlueprintModuleType(module: KeplerStarterModule): string {
  return module.blueprintId;
}

function cloneModule(module: KeplerStarterModule): KeplerStarterModule {
  return {
    ...module,
    connectedTo: [...module.connectedTo],
    capabilities: [...module.capabilities],
    runtimeAttributes: { ...module.runtimeAttributes },
  };
}

function getStringProperty(value: Record<string, unknown>, key: string): string | undefined {
  const property = value[key];
  return typeof property === "string" ? property : undefined;
}

function getNumberProperty(value: Record<string, unknown>, key: string): number | null {
  const property = value[key];
  return typeof property === "number" && Number.isFinite(property) ? property : null;
}

function buildDryRunReasons(input: {
  requirement: BlueprintConstructionRequirement;
  facilityExists: boolean;
  facilityOnline: boolean;
  facilityAvailable: boolean;
  supplyCacheOnline: boolean;
  prerequisitesMet: boolean;
  capabilitiesMet: boolean;
  inventorySufficient: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!input.requirement.published) reasons.push("Blueprint is not published.");
  if (!input.requirement.buildable) reasons.push("Blueprint does not describe something buildable.");
  if (!input.facilityExists) reasons.push("Required facility does not exist.");
  if (!input.facilityOnline) reasons.push("Required facility is not online.");
  if (!input.facilityAvailable) reasons.push("Required facility is busy.");
  if (!input.supplyCacheOnline) reasons.push("Supply cache is not online.");
  if (!input.prerequisitesMet) reasons.push("Prerequisite modules are missing.");
  if (!input.capabilitiesMet) reasons.push("Prerequisite capabilities are missing.");
  if (!input.inventorySufficient) reasons.push("Inventory is missing required resources.");
  return reasons;
}

function nextFutureModuleId(blueprintId: string, modules: KeplerStarterModule[]): string {
  let index = 1;
  while (modules.some((module) => module.id === `${blueprintId}-${index}`)) {
    index += 1;
  }
  return `${blueprintId}-${index}`;
}

function subtractMaterials(
  resources: Record<string, number>,
  required: Record<string, number>,
): Record<string, number> {
  const next = { ...resources };
  for (const [resourceType, amount] of Object.entries(required)) {
    const current = next[resourceType] ?? 0;
    next[resourceType] = roundTo(current - amount);
  }
  return next;
}

function roundTo(value: number): number {
  return Number(value.toFixed(6));
}
