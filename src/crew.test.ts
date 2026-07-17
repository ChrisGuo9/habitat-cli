import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acknowledgeAlert, observeAlert, resolveAlert } from "./alerts";
import { deployExplorer, moveExplorer, validateCollection } from "./exploration";
import { moveHuman } from "./humans";
import {
  dockExploration,
  hydrateRegistrationState,
  readAlertContract,
  readAlertState,
  readExplorationState,
  readHumanState,
  readModuleState,
  readRegistration,
  writeAlertState,
  writeExplorationState,
  writeHumanState,
  writeModuleState,
} from "./state";

const temp = () => mkdtempSync(join(tmpdir(), "habitat-crew-"));
const modules = {
  modules: [
    { id: "cmd-1", blueprintId: "command-module", displayName: "Command", connectedTo: [], runtimeAttributes: { crewCapacity: 2, status: "online" }, capabilities: [] },
    { id: "suit-1", blueprintId: "basic-suitport", displayName: "Suitport", connectedTo: [], runtimeAttributes: { crewCapacity: 1, status: "online" }, capabilities: ["limited-eva", "suitport-access"] },
  ],
  blueprints: [],
};
const humans = { humans: [
  { id: "human-1", displayName: "Avery", locationModuleId: "cmd-1" },
  { id: "human-2", displayName: "Riley", locationModuleId: "suit-1" },
] };

describe("crew state and behavior", () => {
  test("registration hydrates modules, humans, and alert contract together", () => {
    const cwd = temp();
    try {
      hydrateRegistrationState({
        registration: { habitatId: "hab-1", habitatUuid: "uuid-1", displayName: "Crew", baseUrl: "https://planet.turingguild.com", tokenSource: "test" },
        modules,
        humans,
        alertContract: { schemaVersion: "1.0", schema: { required: ["severity", "status", "source"] } },
      }, cwd);
      expect(readRegistration(cwd)?.habitatId).toBe("hab-1");
      expect(readModuleState(cwd)?.modules).toHaveLength(2);
      expect(readHumanState(cwd)?.humans).toEqual(humans.humans);
      expect(readAlertContract(cwd)?.schemaVersion).toBe("1.0");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("human movement enforces destination existence and crew capacity", () => {
    const cwd = temp();
    try {
      writeModuleState(modules, cwd); writeHumanState(humans, cwd);
      expect(() => moveHuman("missing", "cmd-1", cwd)).toThrow("Human not found");
      expect(() => moveHuman("human-1", "missing", cwd)).toThrow("Destination module not found");
      expect(() => moveHuman("human-1", "suit-1", cwd)).toThrow("crew capacity");
      expect(readHumanState(cwd)).toEqual(humans);
      expect(moveHuman("human-2", "cmd-1", cwd).locationModuleId).toBe("cmd-1");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("EVA deploys from the active suitport and permits only adjacent in-bounds moves", () => {
    const cwd = temp();
    try {
      writeModuleState(modules, cwd); writeHumanState(humans, cwd);
      expect(() => deployExplorer("human-1", cwd)).toThrow("active suitport");
      expect(deployExplorer("human-2", cwd)).toMatchObject({ humanId: "human-2", x: 0, y: 0, carriedResources: {} });
      expect(moveExplorer(1, 0, { minX: -1, maxX: 1, minY: -1, maxY: 1 }, cwd)).toMatchObject({ x: 1, y: 0 });
      expect(() => moveExplorer(2, 1, { minX: -2, maxX: 2, minY: -2, maxY: 2 }, cwd)).toThrow("one grid tile");
      expect(() => moveExplorer(2, 0, { minX: -1, maxX: 1, minY: -1, maxY: 1 }, cwd)).toThrow("outside");
      expect(readExplorationState(cwd)).toMatchObject({ x: 1, y: 0 });
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("collection validation requires a deployed explorer and remaining whole-kilogram capacity", () => {
    const cwd = temp();
    try {
      expect(() => validateCollection(1, cwd)).toThrow("No human is deployed");
      writeExplorationState({ humanId: "human-1", suitportModuleId: "suit-1", x: 0, y: 0, carriedResources: { ferrite: 9 }, maxCapacityKg: 10 }, cwd);
      expect(() => validateCollection(1.5, cwd)).toThrow("positive whole number");
      expect(() => validateCollection(2, cwd)).toThrow("carrying capacity");
      expect(validateCollection(1, cwd).remainingCapacityKg).toBe(1);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("docking rolls back when the deployed human is missing", () => {
    const cwd = temp();
    try {
      writeHumanState({ humans: [] }, cwd);
      writeExplorationState({ humanId: "missing", suitportModuleId: "suit-1", x: 0, y: 0, carriedResources: { ferrite: 2 }, maxCapacityKg: 10 }, cwd);
      expect(() => dockExploration(cwd)).toThrow("Deployed human not found");
      expect(readExplorationState(cwd)?.carriedResources).toEqual({ ferrite: 2 });
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  test("alerts deduplicate unresolved conditions and support acknowledge and resolve", () => {
    const cwd = temp();
    try {
      writeAlertState({ alerts: [] }, cwd);
      const first = observeAlert({ condition: "human-outside", severity: "warning", source: "eva", subject: { type: "human", id: "human-1" } }, cwd, "2026-07-17T10:00:00.000Z");
      expect(first).toMatchObject({ code: "human-outside", title: "Human deployed outside habitat", openedAt: "2026-07-17T10:00:00.000Z" });
      expect(first.description).toBeString();
      const repeated = observeAlert({ condition: "human-outside", severity: "warning", source: "eva", subject: { type: "human", id: "human-1" } }, cwd, "2026-07-17T10:01:00.000Z");
      expect(repeated.id).toBe(first.id);
      expect(repeated.occurrenceCount).toBe(2);
      expect(acknowledgeAlert(first.id, cwd, "2026-07-17T10:02:00.000Z").status).toBe("acknowledged");
      expect(resolveAlert("human-outside", { type: "human", id: "human-1" }, cwd, "2026-07-17T10:03:00.000Z")?.status).toBe("resolved");
      expect(readAlertState(cwd)?.alerts).toHaveLength(1);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
