import type { KeplerConfig } from "./config";

export type KeplerBlueprint = {
  id: string;
  blueprintId: string;
  displayName: string;
  description: string;
  status: "draft" | "published";
  output: Record<string, unknown>;
  inputs: Record<string, unknown>;
  buildTicks: number;
  repeatable: boolean;
  productionCost?: Record<string, unknown>;
  requiredFacility?: Record<string, unknown>;
  prerequisites?: string[];
  unlocks?: string[];
  level?: number | null;
  target?: Record<string, unknown>;
  facilityLevel?: Record<string, unknown>;
  attachmentPoints?: Record<string, unknown>;
  attachmentRequirements?: Array<Record<string, unknown>>;
  runtimeAttributes?: Record<string, unknown>;
  capabilities?: string[];
};

export type KeplerBlueprintCatalogResponse = {
  catalogVersion: string;
  blueprints: KeplerBlueprint[];
};

export type KeplerIndustryResource = {
  id: string;
  resourceType: string;
  displayName: string;
  kind: string;
  rarity: string;
  description: string;
  unit?: string;
};

export type KeplerResourceCatalogResponse = {
  catalogVersion: string;
  resources: KeplerIndustryResource[];
};

export type KeplerStarterModule = {
  id: string;
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

export type KeplerRegistrationResponse = {
  habitatId: string;
  streamUrl: string;
  apiToken: string;
  stream: KeplerStreamMetadata;
  starterModules: KeplerStarterModule[];
  blueprints: KeplerBlueprint[];
};

export type KeplerStreamMetadata = {
  protocolVersion: string;
  subscriptions: Array<"ticks">;
  currentTick: number;
  tickIntervalMs: number;
  ticksPerPulse: number;
  status: "paused" | "running";
};

export type KeplerHabitat = {
  id: string;
  habitatSlug: string;
  displayName: string;
  catalogVersion: string;
  status: string;
  lastSeenAt: string | null;
};

export type KeplerHabitatResponse = {
  habitat: KeplerHabitat;
};

export type KeplerBlueprintResponse = {
  blueprint: KeplerBlueprint;
};

export type SolarIrradianceResponse = {
  solarIrradiance: {
    wPerM2: number;
    condition: string;
  };
};

export type WorldScanProbability = {
  resourceType: string | null;
  probabilityPct: number;
};

export type WorldScanQuantityEstimate = {
  resourceType: string;
  unit: "kg";
  estimatedKg: number;
  minimumKg: number;
  maximumKg: number;
  exact: boolean;
};

export type WorldScanTile = {
  x: number;
  y: number;
  terrain: "flat";
  distanceTiles: number;
  probabilities: WorldScanProbability[];
  topCandidate: WorldScanProbability;
  quantityEstimate: WorldScanQuantityEstimate | null;
};

export type WorldScanResponse = {
  scan: {
    modelVersion: "resource-probability-v2";
    origin: { x: number; y: number };
    sensorStrength: number;
    radiusTiles: number;
    tiles: WorldScanTile[];
  };
};

export type WorldScanInput = {
  habitatId: string;
  x: number;
  y: number;
  sensorStrength: number;
  radiusTiles: number;
};

async function keplerRequest<T>(config: KeplerConfig, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kepler request failed (${response.status}): ${body || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function registerHabitat(config: KeplerConfig, displayName: string, habitatUuid: string) {
  return keplerRequest<KeplerRegistrationResponse>(config, "/habitats/register", {
    method: "POST",
    body: JSON.stringify({ displayName, habitatUuid }),
  });
}

export function getHabitatRegistration(config: KeplerConfig, habitatId: string) {
  return keplerRequest<KeplerHabitatResponse>(
    config,
    `/habitats/${encodeURIComponent(habitatId)}/registration`,
    { method: "GET" },
  );
}

export function getSolarIrradiance(config: KeplerConfig) {
  return keplerRequest<SolarIrradianceResponse>(config, "/world/solar-irradiance", { method: "GET" });
}

export function scanWorld(config: KeplerConfig, input: WorldScanInput) {
  const query = new URLSearchParams({
    habitatId: input.habitatId,
    x: String(input.x),
    y: String(input.y),
    sensorStrength: String(input.sensorStrength),
    radiusTiles: String(input.radiusTiles),
  });
  return keplerRequest<WorldScanResponse>(config, `/world/scan?${query}`, { method: "GET" });
}

export function listBlueprintCatalog(config: KeplerConfig) {
  return keplerRequest<KeplerBlueprintCatalogResponse>(config, "/catalog/blueprints", { method: "GET" });
}

export function listResourceCatalog(config: KeplerConfig) {
  return keplerRequest<KeplerResourceCatalogResponse>(config, "/catalog/resources", { method: "GET" });
}

export function getBlueprint(config: KeplerConfig, blueprintId: string) {
  return keplerRequest<KeplerBlueprintResponse>(
    config,
    `/catalog/blueprints/${encodeURIComponent(blueprintId)}`,
    { method: "GET" },
  ).then((response) => response.blueprint);
}
