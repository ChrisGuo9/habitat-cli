import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFabricator, deleteFabricator, getFabricator, listFabricators } from "./workshop";

const cliPath = resolve(import.meta.dir, "index.ts");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-workshop-"));
}

function runCli(args: string[], cwd: string) {
  return Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("workshop fabricator storage", () => {
  test("supports local fabricator CRUD in persisted state", () => {
    const cwd = makeTempDir();
    try {
      const created = createFabricator("Main Fabricator", cwd);
      expect(created.id).toBe("w1");
      expect(created.name).toBe("Main Fabricator");
      expect(created.status).toBe("idle");
      expect(getFabricator(created.id, cwd)).toEqual(created);

      expect(listFabricators(cwd)).toHaveLength(1);
      expect(deleteFabricator(created.id, cwd)).toBe(true);
      expect(listFabricators(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("habitat workshop cli", () => {
  test("prints workshop help with examples", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["workshop", "--help"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Examples:");
      expect(result.stdout.toString()).toContain('habitat workshop create "Main Fabricator"');
      expect(result.stdout.toString()).toContain("habitat workshop delete w1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates a fabricator", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["workshop", "create", "Main Fabricator"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Created workshop fabricator");
      expect(result.stdout.toString()).toContain("Main Fabricator");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("lists fabricators", () => {
    const cwd = makeTempDir();
    try {
      runCli(["workshop", "create", "Main Fabricator"], cwd);
      const result = runCli(["workshop", "list"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Main Fabricator");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("shows fabricator status", () => {
    const cwd = makeTempDir();
    try {
      const created = createFabricator("Main Fabricator", cwd);
      const result = runCli(["workshop", "status", created.id], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain(created.id);
      expect(result.stdout.toString()).toContain("Main Fabricator");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("deletes a fabricator", () => {
    const cwd = makeTempDir();
    try {
      const created = createFabricator("Main Fabricator", cwd);
      const result = runCli(["workshop", "delete", created.id], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Deleted workshop fabricator");
      expect(listFabricators(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
