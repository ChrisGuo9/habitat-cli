import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addCacheItem, consumeCacheItem, createCache, deleteCache, getCache, listCaches } from "./cache";

const cliPath = resolve(import.meta.dir, "index.ts");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-cache-"));
}

function runCli(args: string[], cwd: string) {
  return Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("supply cache storage", () => {
  test("supports local cache item CRUD in persisted state", () => {
    const cwd = makeTempDir();
    try {
      const created = createCache("Food Store A", "food", cwd);
      expect(created.id).toBe("c1");
      expect(created.name).toBe("Food Store A");
      expect(created.location).toBe("food");
      expect(created.quantity).toBe(0);
      expect(getCache(created.id, cwd)).toEqual(created);

      const added = addCacheItem(created.id, "Food", cwd);
      expect(added?.quantity).toBe(1);
      expect(added?.items).toHaveLength(1);

      const consumed = consumeCacheItem(created.id, "Food", cwd);
      expect(consumed?.quantity).toBe(0);
      expect(consumed?.items).toHaveLength(0);

      expect(listCaches(cwd)).toHaveLength(1);
      expect(deleteCache(created.id, cwd)).toBe(true);
      expect(listCaches(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("habitat cache cli", () => {
  test("prints cache help with examples", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["cache", "--help"], cwd);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Examples:");
      expect(result.stdout.toString()).toContain('habitat cache create "Food Store A" --type food');
      expect(result.stdout.toString()).toContain('habitat cache delete food-store-a');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates a cache", () => {
    const cwd = makeTempDir();
    try {
      const result = runCli(["cache", "create", "Food Store A", "--type", "food"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Created cache");
      expect(result.stdout.toString()).toContain("Food Store A");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("lists caches", () => {
    const cwd = makeTempDir();
    try {
      runCli(["cache", "create", "Food Store A", "--type", "food"], cwd);
      const result = runCli(["cache", "list"], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Food Store A");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("adds and consumes items", () => {
    const cwd = makeTempDir();
    try {
      const created = createCache("Food Store A", "food", cwd);
      const addResult = runCli(["cache", "add", created.id, "--type", "Food"], cwd);
      expect(addResult.exitCode).toBe(0);
      expect(addResult.stdout.toString()).toContain("Added item to cache");

      const consumeResult = runCli(["cache", "consume", created.id, "--type", "Food"], cwd);
      expect(consumeResult.exitCode).toBe(0);
      expect(consumeResult.stdout.toString()).toContain("Consumed item from cache");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("deletes a cache", () => {
    const cwd = makeTempDir();
    try {
      const created = createCache("Food Store A", "food", cwd);
      const result = runCli(["cache", "delete", created.id], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("Deleted cache");
      expect(listCaches(cwd)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
