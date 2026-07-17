import { loadKeplerConfig } from "./config";
import { getSolarIrradiance } from "./kepler";
import { runSimulationTicks, type SimulationResult } from "./simulation";
import {
  readClockState,
  readConstructionState,
  readModuleState,
  readSimulationState,
  writeClockState,
  writeConstructionState,
  writeModuleState,
  writeSimulationState,
} from "./state";

export type PlanetTickNotice = {
  tick: number;
  previousTick: number;
  advancedBy: number;
  issuedAt: string;
};

type SolarResponse = Awaited<ReturnType<typeof getSolarIrradiance>>;

type TickServiceDependencies = {
  cwd?: string;
  getSolar?: () => Promise<SolarResponse>;
};

export type TickResult = SimulationResult & { solarIrradiance: SolarResponse["solarIrradiance"] };

export function createTickService(dependencies: TickServiceDependencies = {}) {
  const cwd = dependencies.cwd ?? process.cwd();
  const getSolar = dependencies.getSolar ?? (() => getSolarIrradiance(loadKeplerConfig()));
  let queue: Promise<void> = Promise.resolve();

  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function apply(count: number): Promise<TickResult> {
    const modules = readModuleState(cwd);
    if (!modules) {
      throw new Error('No local module state found. Run "habitat register --name \\"<habitat name>\\"" first.');
    }
    const solar = await getSolar();
    const result = runSimulationTicks({
      moduleState: modules,
      simulationState: readSimulationState(cwd) ?? { currentTick: 0 },
      tickCount: count,
      solarIrradianceWPerM2: solar.solarIrradiance.wPerM2,
      constructionState: readConstructionState(cwd),
    });
    writeModuleState(result.moduleState, cwd);
    writeSimulationState(result.simulationState, cwd);
    writeConstructionState(result.constructionState, cwd);
    return { ...result, solarIrradiance: solar.solarIrradiance };
  }

  return {
    runManual(count: number): Promise<TickResult> {
      return serialized(async () => {
        if (readClockState(cwd).mode === "kepler") {
          throw new Error("Manual ticks are disabled while listening to Kepler. Run `habitat clock listen off` to return to manual mode.");
        }
        return apply(count);
      });
    },

    runKepler(notice: PlanetTickNotice): Promise<{ applied: boolean; result: TickResult | null }> {
      return serialized(async () => {
        const clock = readClockState(cwd);
        if (clock.mode !== "kepler" || (clock.lastKeplerTick !== null && notice.tick <= clock.lastKeplerTick)) {
          return { applied: false, result: null };
        }
        const result = await apply(notice.advancedBy);
        writeClockState({
          ...clock,
          lastKeplerTick: notice.tick,
          lastAdvancedBy: notice.advancedBy,
          lastMessageAt: notice.issuedAt,
          lastConnectionError: null,
        }, cwd);
        return { applied: true, result };
      });
    },

    idle(): Promise<void> {
      return queue;
    },
  };
}

export type TickService = ReturnType<typeof createTickService>;
