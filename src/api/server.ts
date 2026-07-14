import { Hono } from "hono";
import { loadKeplerConfig } from "../config";
import { getBlueprint, getHabitatRegistration, getSolarIrradiance, listBlueprintCatalog, listResourceCatalog, registerHabitat } from "../kepler";
import { hydrateModulesFromRegistration, readConstructionState, readInventoryState, readModuleState, readRegistration, removeConstructionState, removeInventoryState, removeModuleState, removeRegistration, writeInventoryState, writeModuleState, writeRegistration } from "../state";
import type { HabitatInventoryState, HabitatModuleState } from "../state";

export function createApi(cwd = process.cwd()): Hono {
  const app = new Hono();
  const log = (message: string) => console.log(`[habitat-api] ${message}`);
  const kepler = async <T>(method: string, path: string, action: () => Promise<T>): Promise<T> => {
    try { const result = await action(); console.log(`[kepler] ${method} ${path} -> 200`); return result; }
    catch (error) { console.log(`[kepler] ${method} ${path} -> error`); throw error; }
  };
  const jsonError = (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) });

  app.get("/registration", (c) => {
    const persisted = readRegistration(cwd);
    const registration = persisted
      ? {
          habitatUuid: persisted.habitatUuid,
          habitatId: persisted.habitatId,
          displayName: persisted.displayName,
          apiToken: persisted.tokenSource,
        }
      : null;
    log(`GET /registration -> ${registration ? "registered" : "not registered"}`);
    return c.json({ registration });
  });
  app.post("/registration", async (c) => {
    try {
      const { name } = await c.req.json<{ name?: string }>();
      if (!name) return c.json({ error: "Registration name is required." }, 400);
      const config = loadKeplerConfig();
      const habitatUuid = crypto.randomUUID();
      const response = await kepler("POST", "/habitats/register", () => registerHabitat(config, name, habitatUuid));
      writeRegistration({ habitatId: response.habitatId, habitatUuid, displayName: name, baseUrl: config.baseUrl, tokenSource: config.tokenSource });
      writeModuleState(hydrateModulesFromRegistration(response.starterModules, response.blueprints));
      log("POST /registration -> registered");
      return c.json(readRegistration(), 201);
    } catch (error) { return c.json(jsonError(error), 502); }
  });
  app.delete("/registration", (c) => { removeRegistration(); removeModuleState(); removeInventoryState(); removeConstructionState(); log("DELETE /registration -> cleared"); return c.json({ ok: true }); });
  app.get("/state", (c) => c.json({ registration: readRegistration(), modules: readModuleState(), inventory: readInventoryState(), construction: readConstructionState() }));
  app.put("/state", async (c) => {
    const value = await c.req.json<{ modules?: HabitatModuleState | null; inventory?: HabitatInventoryState | null; construction?: unknown | null; simulation?: unknown | null }>();
    if (value.modules) writeModuleState(value.modules); else if (value.modules === null) removeModuleState();
    if (value.inventory) writeInventoryState(value.inventory); else if (value.inventory === null) removeInventoryState();
    if (value.construction) { const { writeConstructionState } = await import("../state"); writeConstructionState(value.construction as never); } else if (value.construction === null) removeConstructionState();
    if (value.simulation) { const { writeSimulationState } = await import("../state"); writeSimulationState(value.simulation as never); } else if (value.simulation === null) { const { removeSimulationState } = await import("../state"); removeSimulationState(); }
    return c.json({ ok: true });
  });
  app.get("/modules", (c) => { const value = readModuleState(); log(`GET /modules -> ${value?.modules.length ?? 0} modules`); return c.json(value); });
  app.put("/modules", async (c) => { const value = await c.req.json<HabitatModuleState>(); writeModuleState(value); log(`PUT /modules -> ${value.modules.length} modules`); return c.json(value); });
  app.get("/inventory", (c) => c.json(readInventoryState()));
  app.put("/inventory", async (c) => { const value = await c.req.json<HabitatInventoryState>(); writeInventoryState(value); return c.json(value); });
  app.get("/catalog/blueprints", async (c) => { try { log("GET /catalog/blueprints -> proxied to Kepler"); return c.json(await kepler("GET", "/catalog/blueprints", () => listBlueprintCatalog(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/catalog/blueprints/:id", async (c) => { try { const id = c.req.param("id"); return c.json(await kepler("GET", `/catalog/blueprints/${id}`, async () => ({ blueprint: await getBlueprint(loadKeplerConfig(), id) }))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/catalog/resources", async (c) => { try { log("GET /catalog/resources -> proxied to Kepler"); return c.json(await kepler("GET", "/catalog/resources", () => listResourceCatalog(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/solar/irradiance", async (c) => { try { return c.json(await kepler("GET", "/world/solar-irradiance", () => getSolarIrradiance(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/habitat/status", async (c) => { try { const reg = readRegistration(); if (!reg) return c.json(null); return c.json(await kepler("GET", `/habitats/${reg.habitatId}/registration`, () => getHabitatRegistration(loadKeplerConfig(), reg.habitatId))); } catch (error) { return c.json(jsonError(error), 502); } });
  return app;
}

export async function startServer(): Promise<void> {
  const host = process.env.HABITAT_API_HOST ?? "127.0.0.1";
  const port = Number(process.env.HABITAT_API_PORT ?? "8787");
  const server = Bun.serve({ hostname: host, port, fetch: createApi().fetch });
  console.log(`[habitat-api] listening on http://${host}:${server.port}`);
}
