import type {
  HabitatConstructionState,
  HabitatInventoryState,
  HabitatModuleState,
  HabitatRegistration,
  HabitatSimulationState,
} from "../state";
import type {
  KeplerBlueprint,
  KeplerBlueprintCatalogResponse,
  KeplerResourceCatalogResponse,
  SolarIrradianceResponse,
} from "../kepler";

export type ApiState = {
  registration: HabitatRegistration | null;
  modules: HabitatModuleState | null;
  inventory: HabitatInventoryState | null;
  construction: HabitatConstructionState | null;
  simulation: HabitatSimulationState | null;
};

export type ApiCatalog = KeplerBlueprintCatalogResponse | KeplerResourceCatalogResponse;
export type ApiBlueprint = { blueprint: KeplerBlueprint };
export type ApiSolar = SolarIrradianceResponse;
