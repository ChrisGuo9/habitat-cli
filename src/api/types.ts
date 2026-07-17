import type {
  HabitatClockState,
  HabitatConstructionState,
  HabitatInventoryState,
  HabitatModuleState,
  HabitatRegistration,
  HabitatSimulationState,
  HabitatHumanState,
  HabitatExplorationState,
  HabitatAlertState,
} from "../state";
import type { ClockTickEvent } from "../clock-client";
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
  humans?: HabitatHumanState | null;
  exploration?: HabitatExplorationState | null;
  alerts?: HabitatAlertState | null;
};

export type ApiCatalog = KeplerBlueprintCatalogResponse | KeplerResourceCatalogResponse;
export type ApiBlueprint = { blueprint: KeplerBlueprint };
export type ApiSolar = SolarIrradianceResponse;
export type ApiClockStatus = HabitatClockState & { listening: boolean; manualTicksAllowed: boolean };
export type ApiClockEvent = ClockTickEvent;
