import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "./server";
import { writeRegistration } from "../state";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "habitat-api-"));
}

describe("Habitat API", () => {
  test("GET /registration returns null when no registration exists", async () => {
    const cwd = makeTempDir();

    try {
      const response = await createApi(cwd).request("http://test/registration");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ registration: null });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("GET /registration returns the persisted registration", async () => {
    const cwd = makeTempDir();

    try {
      writeRegistration(
        {
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          habitatId: "habitat-123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "test-api-token",
        },
        cwd,
      );

      const response = await createApi(cwd).request("http://test/registration");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        registration: {
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          habitatId: "habitat-123",
          displayName: "Artemis Ridge",
          apiToken: "test-api-token",
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("DELETE /registration clears backend registration state", async () => {
    const cwd = makeTempDir();

    try {
      writeRegistration(
        {
          habitatUuid: "11111111-1111-4111-8111-111111111111",
          habitatId: "habitat-123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          tokenSource: "test-api-token",
        },
        cwd,
      );

      const response = await createApi(cwd).request("http://test/registration", { method: "DELETE" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      await expect((await createApi(cwd).request("http://test/registration")).json()).resolves.toEqual({ registration: null });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
