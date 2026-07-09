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
  starterModules: KeplerStarterModule[];
  blueprints: KeplerBlueprint[];
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
