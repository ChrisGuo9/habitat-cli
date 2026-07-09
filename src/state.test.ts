import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createModule,
  deleteModule,
  getModule,
  hydrateModulesFromStarterModules,
  readModuleState,
  updateModule,
  writeModuleState,
} from "./state";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-state-"));
}

describe("habitat module state", () => {
  test("hydrates local module records from starter modules", () => {
    const state = hydrateModulesFromStarterModules("2026-06-24", [
      { blueprintId: "alpha", displayName: "Alpha", runtimeAttributes: { level: 1 }, capabilities: ["scan"] },
      { blueprintId: "beta", displayName: "Beta", runtimeAttributes: { level: 2 }, capabilities: ["mine"] },
      { blueprintId: "gamma", displayName: "Gamma", runtimeAttributes: { level: 3 }, capabilities: ["build"] },
      { blueprintId: "delta", displayName: "Delta", runtimeAttributes: { level: 4 }, capabilities: ["store"] },
      { blueprintId: "epsilon", displayName: "Epsilon", runtimeAttributes: { level: 5 }, capabilities: ["route"] },
      { blueprintId: "zeta", displayName: "Zeta", runtimeAttributes: { level: 6 }, capabilities: ["dock"] },
    ]);

    expect(state.catalogVersion).toBe("2026-06-24");
    expect(state.modules).toHaveLength(6);
    expect(state.modules[0]?.blueprintId).toBe("alpha");
    expect(state.modules[0]?.status).toBe("active");
    expect(state.modules[0]?.condition).toBe(100);
  });

  test("supports local module CRUD in persisted state", () => {
    const cwd = makeTempDir();
    try {
      writeModuleState({ catalogVersion: "2026-06-24", modules: [] }, cwd);
      const created = createModule({ blueprintId: "alpha", displayName: "Alpha", runtimeAttributes: {}, capabilities: ["scan"] }, cwd);
      expect(getModule(created.id, cwd)).toEqual(created);

      const updated = updateModule(created.id, { displayName: "Alpha Prime", status: "maintenance", condition: 87 }, cwd);
      expect(updated?.displayName).toBe("Alpha Prime");
      expect(updated?.status).toBe("maintenance");
      expect(updated?.condition).toBe(87);

      expect(deleteModule(created.id, cwd)).toBe(true);
      expect(readModuleState(cwd)?.modules).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
