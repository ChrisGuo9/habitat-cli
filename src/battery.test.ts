import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBattery, deleteBattery, getBattery, listBatteries, updateBattery } from "./battery";

const cliPath = resolve(import.meta.dir, "index.ts");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-battery-"));
}

function runCli(args: string[], cwd: string) {
  return Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("battery storage", () => {
  test("supports local battery CRUD in persisted state", () => {
    const cwd = makeTempDir();
    try {
      const created = createBattery("Main Bank", cwd);
      expect(created.id).toBe("b1");
      expect(created.name).toBe("Main Bank");
      expect(created.chargeLevel).toBe(0);
      expect(getBattery(created.id, cwd)).toEqual(created);

      const updated = updateBattery(created.id, { chargeLevel: 85, charging: true }, cwd);
      expect(updated?.chargeLevel).toBe(85);
      expect(updated?.charging).toBe(true);

      expect(listBatteries(cwd)).toHaveLength(1);
      expect(deleteBattery(created.id, cwd)).toBe(true);
      expect(listBatteries(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("habitat battery cli", () => {
  test("prints battery help with examples", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["battery", "--help"], cwd);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Examples:");
      expect(result.stdout.toString()).toContain('habitat battery create "Main Bank"');
      expect(result.stdout.toString()).toContain("habitat battery update b1 --charge 85");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates a battery", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["battery", "create", "Main Bank"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Created battery");
      expect(result.stdout.toString()).toContain("Main Bank");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("lists batteries", () => {
    const cwd = makeTempDir();
    try {
      runCli(["battery", "create", "Main Bank"], cwd);
      const result = runCli(["battery", "list"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Main Bank");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("shows battery status", () => {
    const cwd = makeTempDir();
    try {
      const created = createBattery("Main Bank", cwd);
      const result = runCli(["battery", "status", created.id], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain(created.id);
      expect(result.stdout.toString()).toContain("Main Bank");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("updates a battery", () => {
    const cwd = makeTempDir();
    try {
      const created = createBattery("Main Bank", cwd);
      const result = runCli(["battery", "update", created.id, "--charge", "85"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Updated battery");
      expect(result.stdout.toString()).toContain("charge=85/100");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("deletes a battery", () => {
    const cwd = makeTempDir();
    try {
      const created = createBattery("Main Bank", cwd);
      const result = runCli(["battery", "delete", created.id], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Deleted battery");
      expect(listBatteries(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
