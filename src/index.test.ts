import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const cliPath = resolve(import.meta.dir, "index.ts");

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("habitat cli", () => {
  test("prints help", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("Usage: habitat [options]");
    expect(result.stdout.toString()).toContain("Main command groups:");
    expect(result.stdout.toString()).toContain("Common command pattern:");
    expect(result.stdout.toString()).toContain("battery  manage batteries");
    expect(result.stdout.toString()).toContain("show help");
  });

  test("prints version", () => {
    const result = runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe("0.1.0");
  });

  test("shows a friendly message for unknown commands", () => {
    const result = runCli(["launch"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Unknown command: launch");
    expect(result.stderr.toString()).toContain('Run "habitat --help" to see available commands.');
  });
});
