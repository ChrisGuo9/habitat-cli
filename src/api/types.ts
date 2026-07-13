import type {
  HabitatConstructionState,
  HabitatInventoryState,
  HabitatModuleState,
  HabitatRegistration,
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
};

export type ApiCatalog = KeplerBlueprintCatalogResponse | KeplerResourceCatalogResponse;
export type ApiBlueprint = { blueprint: KeplerBlueprint };
export type ApiSolar = SolarIrradianceResponse;
