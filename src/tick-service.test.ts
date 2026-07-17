import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTickService } from "./tick-service";
import { defaultClockState, readClockState, readSimulationState, writeClockState, writeModuleState } from "./state";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-ticks-"));
}

function seedModules(cwd: string): void {
  writeModuleState({
    modules: [{
      id: "battery-1",
      blueprintId: "basic-battery",
      displayName: "Battery",
      connectedTo: [],
      runtimeAttributes: { status: "online", currentEnergyKwh: 500, energyStorageKwh: 500 },
      capabilities: ["power-storage"],
    }],
    blueprints: [],
  }, cwd);
}

const solar = async () => ({ solarIrradiance: { wPerM2: 0, condition: "dark" } });

describe("tick service", () => {
  test("manual ticks use the existing simulation while clock mode is manual", async () => {
    const cwd = makeTempDir();
    try {
      seedModules(cwd);
      const result = await createTickService({ cwd, getSolar: solar }).runManual(60);
      expect(result.simulationState.currentTick).toBe(60);
      expect(readSimulationState(cwd)?.currentTick).toBe(60);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("manual ticks are rejected without changing state while listening to Kepler", async () => {
    const cwd = makeTempDir();
    try {
      seedModules(cwd);
      writeClockState({ ...defaultClockState(), mode: "kepler" }, cwd);
      const service = createTickService({ cwd, getSolar: solar });
      await expect(service.runManual(1)).rejects.toThrow("Manual ticks are disabled while listening to Kepler. Run `habitat clock listen off`");
      expect(readSimulationState(cwd)).toBeNull();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("Kepler notices apply the full advancedBy once and ignore older absolute ticks", async () => {
    const cwd = makeTempDir();
    try {
      seedModules(cwd);
      writeClockState({ ...defaultClockState(), mode: "kepler" }, cwd);
      const service = createTickService({ cwd, getSolar: solar });
      const first = await service.runKepler({ tick: 900, previousTick: 800, advancedBy: 100, issuedAt: "2026-07-17T14:30:00.000Z" });
      const duplicate = await service.runKepler({ tick: 900, previousTick: 800, advancedBy: 100, issuedAt: "2026-07-17T14:30:00.000Z" });
      const older = await service.runKepler({ tick: 899, previousTick: 898, advancedBy: 1, issuedAt: "2026-07-17T14:29:00.000Z" });

      expect(first.applied).toBe(true);
      expect(first.result?.simulationState.currentTick).toBe(100);
      expect(duplicate.applied).toBe(false);
      expect(older.applied).toBe(false);
      expect(readSimulationState(cwd)?.currentTick).toBe(100);
      expect(readClockState(cwd)).toMatchObject({ lastKeplerTick: 900, lastAdvancedBy: 100, lastMessageAt: "2026-07-17T14:30:00.000Z" });
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
