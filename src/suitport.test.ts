import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { attachSuit, createSuitport, deleteSuitport, detachSuit, getSuitport, listSuitports } from "./suitport";

const cliPath = resolve(import.meta.dir, "index.ts");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-suitport-"));
}

function runCli(args: string[], cwd: string) {
  return Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("suitport storage", () => {
  test("supports local suitport CRUD in persisted state", () => {
    const cwd = makeTempDir();
    try {
      const created = createSuitport("Port 1", cwd);
      expect(created.id).toBe("s1");
      expect(created.name).toBe("Port 1");
      expect(created.suitAttached).toBe(false);
      expect(getSuitport(created.id, cwd)).toEqual(created);

      const attached = attachSuit(created.id, cwd);
      expect(attached?.suitAttached).toBe(true);
      expect(attached?.status).toBe("attached");

      const detached = detachSuit(created.id, cwd);
      expect(detached?.suitAttached).toBe(false);
      expect(detached?.status).toBe("idle");

      expect(listSuitports(cwd)).toHaveLength(1);
      expect(deleteSuitport(created.id, cwd)).toBe(true);
      expect(listSuitports(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("habitat suitport cli", () => {
  test("prints suitport help with examples", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["suitport", "--help"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Examples:");
      expect(result.stdout.toString()).toContain('habitat suitport create "Port 1"');
      expect(result.stdout.toString()).toContain("habitat suitport detach s1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates a suitport", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["suitport", "create", "Port 1"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Created suitport");
      expect(result.stdout.toString()).toContain("Port 1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("lists suitports", () => {
    const cwd = makeTempDir();
    try {
      runCli(["suitport", "create", "Port 1"], cwd);
      const result = runCli(["suitport", "list"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Port 1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("shows suitport status", () => {
    const cwd = makeTempDir();
    try {
      const created = createSuitport("Port 1", cwd);
      const result = runCli(["suitport", "status", created.id], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain(created.id);
      expect(result.stdout.toString()).toContain("Port 1");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("attaches and detaches a suitport", () => {
    const cwd = makeTempDir();
    try {
      const created = createSuitport("Port 1", cwd);
      const attachResult = runCli(["suitport", "attach", created.id], cwd);
      expect(attachResult.exitCode).toBe(0);
      expect(attachResult.stdout.toString()).toContain("Attached suitport");

      const detachResult = runCli(["suitport", "detach", created.id], cwd);
      expect(detachResult.exitCode).toBe(0);
      expect(detachResult.stdout.toString()).toContain("Detached suitport");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("deletes a suitport", () => {
    const cwd = makeTempDir();
    try {
      const created = createSuitport("Port 1", cwd);
      const result = runCli(["suitport", "delete", created.id], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Deleted suitport");
      expect(listSuitports(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
