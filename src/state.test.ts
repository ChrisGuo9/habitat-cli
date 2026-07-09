import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hydrateModulesFromRegistration,
  readModuleState,
  readRegistration,
  removeModuleState,
  removeRegistration,
  writeRegistration,
} from "./state";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-state-"));
}

describe("habitat state", () => {
  test("persists registration details in .habitat/registration.json", () => {
    const cwd = makeTempDir();

    try {
      writeRegistration(
        {
          habitatId: "habitat-123",
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "KEPLER_PLANET_TOKEN",
        },
        cwd,
      );

      expect(readRegistration(cwd)).toEqual({
        habitatId: "habitat-123",
        habitatUuid: "11111111-1111-4111-8111-111111111111",
        displayName: "Artemis Ridge",
        baseUrl: "https://planet.turingguild.com",
        tokenSource: "KEPLER_PLANET_TOKEN",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("hydrates starter modules and blueprints for local persistence", () => {
    const state = hydrateModulesFromRegistration(
      [
        {
          id: "starter-command-1",
          blueprintId: "command-module",
          displayName: "Command Module",
          connectedTo: [],
          runtimeAttributes: { health: 100 },
          capabilities: ["habitat-command"],
        },
      ],
      [
        {
          id: "blueprint-command-module",
          blueprintId: "command-module",
          displayName: "Command Module Blueprint",
          description: "Primary command center.",
          status: "published",
          output: {},
          inputs: {},
          buildTicks: 120,
          repeatable: false,
        },
      ],
    );

    expect(state.modules).toHaveLength(1);
    expect(state.modules[0]?.id).toBe("starter-command-1");
    expect(state.blueprints).toHaveLength(1);
    expect(state.blueprints[0]?.blueprintId).toBe("command-module");
  });

  test("removes local persisted habitat files", () => {
    const cwd = makeTempDir();

    try {
      writeRegistration(
        {
          habitatId: "habitat-123",
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "KEPLER_PLANET_TOKEN",
        },
        cwd,
      );

      removeRegistration(cwd);
      removeModuleState(cwd);

      expect(readRegistration(cwd)).toBeNull();
      expect(readModuleState(cwd)).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
