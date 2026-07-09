import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addDoorToAirlock, createAirlock, createDoor, deleteAirlock, deleteDoor, getAirlock, getDoor, listAirlocks, listDoors } from "./structures";

const cliPath = resolve(import.meta.dir, "index.ts");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-structures-"));
}

function runCli(args: string[], cwd: string) {
  return Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("structures storage", () => {
  test("supports doors and airlocks in one persisted file", () => {
    const cwd = makeTempDir();
    try {
      const door = createDoor("Outer Door", cwd);
      const airlock = createAirlock("Main Airlock", cwd);
      expect(door.id).toBe("d1");
      expect(airlock.id).toBe("a1");

      const linked = addDoorToAirlock(airlock.id, door.id, cwd);
      expect(linked?.doorIds).toEqual([door.id]);
      expect(getDoor(door.id, cwd)).toEqual(door);
      expect(getAirlock(airlock.id, cwd)?.doorIds).toEqual([door.id]);

      expect(listDoors(cwd)).toHaveLength(1);
      expect(listAirlocks(cwd)).toHaveLength(1);
      expect(deleteDoor(door.id, cwd)).toBe(true);
      expect(getAirlock(airlock.id, cwd)?.doorIds).toEqual([]);
      expect(deleteAirlock(airlock.id, cwd)).toBe(true);
      expect(listDoors(cwd)).toHaveLength(0);
      expect(listAirlocks(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("habitat door and airlock cli", () => {
  test("prints door help with examples", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["door", "--help"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain('habitat door create "Outer Door"');
      expect(result.stdout.toString()).toContain("Door flow:");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates a door", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["door", "create", "Outer Door", "--status", "closed", "--locked"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Created door");
      expect(result.stdout.toString()).toContain("Outer Door");
      expect(result.stdout.toString()).toContain("status=closed");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prints airlock help with add-door example", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["airlock", "--help"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Examples:");
      expect(result.stdout.toString()).toContain("habitat airlock add-door a1 d1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates an airlock and attaches a door", () => {
    const cwd = makeTempDir();
    try {
      const airlock = createAirlock("Main Airlock", cwd);
      const door = createDoor("Outer Door", cwd);
      const result = runCli(["airlock", "add-door", airlock.id, door.id], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Attached door to airlock");
      expect(result.stdout.toString()).toContain(door.id);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("lists and deletes doors and airlocks", () => {
    const cwd = makeTempDir();
    try {
      const airlock = createAirlock("Main Airlock", cwd);
      const door = createDoor("Outer Door", cwd);
      expect(runCli(["door", "list"], cwd).stdout.toString()).toContain("Outer Door");
      expect(runCli(["airlock", "list"], cwd).stdout.toString()).toContain("Main Airlock");
      expect(runCli(["door", "delete", door.id], cwd).exitCode).toBe(0);
      expect(runCli(["airlock", "delete", airlock.id], cwd).exitCode).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
