import { Hono } from "hono";
import type { Context } from "hono";
import { loadKeplerConfig } from "../config";
import { getBlueprint, getHabitatRegistration, getSolarIrradiance, listBlueprintCatalog, listResourceCatalog, registerHabitat } from "../kepler";
import { createModule, deleteModule, getModuleReference, hydrateModulesFromRegistration, readConstructionState, readInventoryState, readModuleState, readRegistration, readSimulationState, removeConstructionState, removeInventoryState, removeModuleState, removeRegistration, removeSimulationState, updateModule, writeConstructionState, writeInventoryState, writeModuleState, writeRegistration, writeSimulationState } from "../state";
import type { HabitatInventoryState, HabitatModuleState, LocalModuleInput, LocalModuleUpdate } from "../state";
import { readServerConfig } from "./server-config";

type ApiDependencies = {
  listBlueprintCatalog?: typeof listBlueprintCatalog;
  getBlueprint?: typeof getBlueprint;
  listResourceCatalog?: typeof listResourceCatalog;
  getSolarIrradiance?: typeof getSolarIrradiance;
};

export function createApi(cwd = process.cwd(), dependencies: ApiDependencies = {}): Hono {
  const app = new Hono();
  const listBlueprints = dependencies.listBlueprintCatalog ?? listBlueprintCatalog;
  const getOneBlueprint = dependencies.getBlueprint ?? getBlueprint;
  const listResources = dependencies.listResourceCatalog ?? listResourceCatalog;
  const getSolar = dependencies.getSolarIrradiance ?? getSolarIrradiance;
  const log = (message: string) => console.log(`[habitat-api] ${message}`);
  const kepler = async <T>(method: string, path: string, action: () => Promise<T>, successStatus = 200): Promise<T> => {
    try { const result = await action(); console.log(`[kepler] ${method} ${path} -> ${successStatus}`); return result; }
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
      const response = await kepler("POST", "/habitats/register", () => registerHabitat(config, name, habitatUuid), 201);
      writeRegistration({ habitatId: response.habitatId, habitatUuid, displayName: name, baseUrl: config.baseUrl, tokenSource: config.tokenSource }, cwd);
      writeModuleState(hydrateModulesFromRegistration(response.starterModules, response.blueprints), cwd);
      log("POST /registration -> registered");
      return c.json(readRegistration(cwd), 201);
    } catch (error) { return c.json(jsonError(error), 502); }
  });
  app.delete("/registration", (c) => { removeRegistration(cwd); removeModuleState(cwd); removeSimulationState(cwd); removeInventoryState(cwd); removeConstructionState(cwd); log("DELETE /registration -> cleared"); return c.json({ ok: true }); });
  app.get("/state", (c) => c.json({ registration: readRegistration(cwd), modules: readModuleState(cwd), inventory: readInventoryState(cwd), construction: readConstructionState(cwd), simulation: readSimulationState(cwd) }));
  app.put("/state", async (c) => {
    const value = await c.req.json<{ modules?: HabitatModuleState | null; inventory?: HabitatInventoryState | null; construction?: unknown | null; simulation?: unknown | null }>();
    if (value.modules) writeModuleState(value.modules, cwd); else if (value.modules === null) removeModuleState(cwd);
    if (value.inventory) writeInventoryState(value.inventory, cwd); else if (value.inventory === null) removeInventoryState(cwd);
    if (value.construction) writeConstructionState(value.construction as never, cwd); else if (value.construction === null) removeConstructionState(cwd);
    if (value.simulation) writeSimulationState(value.simulation as never, cwd); else if (value.simulation === null) removeSimulationState(cwd);
    return c.json({ ok: true });
  });
  app.get("/modules", (c) => { const value = readModuleState(cwd); log(`GET /modules -> ${value?.modules.length ?? 0} modules`); return c.json(value); });
  app.put("/modules", async (c) => { const value = await c.req.json<HabitatModuleState>(); writeModuleState(value, cwd); log(`PUT /modules -> ${value.modules.length} modules`); return c.json(value); });
  app.get("/modules/:id", (c) => {
    const reference = getModuleReference(c.req.param("id"), cwd);
    return reference ? c.json(reference.module) : c.json({ error: `Local module not found: ${c.req.param("id")}` }, 404);
  });
  app.post("/modules", async (c) => {
    try {
      const module = createModule(await c.req.json<LocalModuleInput>(), cwd);
      return c.json(module, 201);
    } catch (error) { return c.json(jsonError(error), 400); }
  });
  app.patch("/modules/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const module = updateModule(id, await c.req.json<LocalModuleUpdate>(), cwd);
      return module ? c.json(module) : c.json({ error: `Local module not found: ${id}` }, 404);
    } catch (error) { return c.json(jsonError(error), 400); }
  });
  app.delete("/modules/:id", (c) => {
    const id = c.req.param("id");
    try {
      return deleteModule(id, cwd) ? c.json({ ok: true }) : c.json({ error: `Local module not found: ${id}` }, 404);
    } catch (error) { return c.json(jsonError(error), 400); }
  });
  app.get("/inventory", (c) => c.json(readInventoryState(cwd)));
  app.put("/inventory", async (c) => { const value = await c.req.json<HabitatInventoryState>(); writeInventoryState(value, cwd); return c.json(value); });
  app.get("/catalog/blueprints", async (c) => { try { log("GET /catalog/blueprints -> proxied to Kepler"); return c.json(await kepler("GET", "/catalog/blueprints", () => listBlueprints(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/catalog/blueprints/:id", async (c) => { try { const id = c.req.param("id"); return c.json(await kepler("GET", `/catalog/blueprints/${id}`, async () => ({ blueprint: await getOneBlueprint(loadKeplerConfig(), id) }))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/catalog/resources", async (c) => { try { log("GET /catalog/resources -> proxied to Kepler"); return c.json(await kepler("GET", "/catalog/resources", () => listResources(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/solar/irradiance", async (c) => { try { return c.json(await kepler("GET", "/world/solar-irradiance", () => getSolar(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  const statusHandler = async (c: Context) => {
    try {
      const reg = readRegistration(cwd);
      if (!reg) return c.json(null);
      return c.json(await kepler("GET", `/habitats/${reg.habitatId}/registration`, () => getHabitatRegistration(loadKeplerConfig(), reg.habitatId)));
    } catch (error) {
      return c.json(jsonError(error), 502);
    }
  };
  app.get("/habitat/status", statusHandler);
  app.get("/status", statusHandler);
  return app;
}

export async function startServer(): Promise<void> {
  const config = readServerConfig();
  const server = Bun.serve({ hostname: config.host, port: config.port, fetch: createApi().fetch });
  console.log(`[habitat-api] listening on http://${config.host}:${server.port}`);
}
