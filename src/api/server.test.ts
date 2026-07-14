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

  test("catalog and solar routes return structured Kepler data", async () => {
    const cwd = makeTempDir();

    try {
      const app = createApi(cwd, {
      listBlueprintCatalog: async () => ({ catalogVersion: "catalog-test", blueprints: [] }),
      getBlueprint: async (_config, blueprintId) => ({
        id: `blueprint-${blueprintId}`,
        blueprintId,
        displayName: "Test Blueprint",
        description: "A test blueprint.",
        status: "published",
        output: {},
        inputs: {},
        buildTicks: 10,
        repeatable: false,
      }),
      listResourceCatalog: async () => ({ catalogVersion: "catalog-test", resources: [] }),
      getSolarIrradiance: async () => ({ solarIrradiance: { wPerM2: 900, condition: "clear" } }),
      });

      const blueprintList = await app.request("http://test/catalog/blueprints");
      const blueprintShow = await app.request("http://test/catalog/blueprints/test-blueprint");
      const resources = await app.request("http://test/catalog/resources");
      const solar = await app.request("http://test/solar/irradiance");

      expect(blueprintList.status).toBe(200);
      expect(await blueprintList.json()).toEqual({ catalogVersion: "catalog-test", blueprints: [] });
      expect(await blueprintShow.json()).toMatchObject({ blueprint: { blueprintId: "test-blueprint" } });
      expect(await resources.json()).toEqual({ catalogVersion: "catalog-test", resources: [] });
      expect(await solar.json()).toEqual({ solarIrradiance: { wPerM2: 900, condition: "clear" } });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
