import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { resolve } from "node:path";
import { loadKeplerConfig } from "../config";
import { collectWorldResource, getBlueprint, getCurrentWorldSector, getHabitatRegistration, getSolarIrradiance, listBlueprintCatalog, listResourceCatalog, registerHabitat, scanWorld } from "../kepler";
import { createModule, defaultClockState, deleteModule, dockExploration, getModuleReference, hydrateModulesFromRegistration, hydrateRegistrationState, readAlertState, readConstructionState, readExplorationState, readHumanState, readInventoryState, readModuleState, readRegistration, readSimulationState, removeAlertContract, removeAlertState, removeClockState, removeConstructionState, removeExplorationState, removeHumanState, removeInventoryState, removeModuleState, removeRegistration, removeSimulationState, updateModule, writeClockState, writeConstructionState, writeInventoryState, writeModuleState, writeRegistration, writeSimulationState } from "../state";
import type { HabitatInventoryState, HabitatModuleState, LocalModuleInput, LocalModuleUpdate } from "../state";
import { readServerConfig } from "./server-config";
import { cancelConstruction, startConstruction } from "../construction";
import { createTickService } from "../tick-service";
import type { TickService } from "../tick-service";
import { createKeplerClockController } from "../clock-client";
import type { ClockTickEvent, KeplerClockController } from "../clock-client";
import { listHumans, moduleHasOccupants, moveHuman } from "../humans";
import { addCarriedResource, deployExplorer, moveExplorer, validateCollection } from "../exploration";
import { acknowledgeAlert, observeAlert, resolveAlert } from "../alerts";

type ApiDependencies = {
  registerHabitat?: typeof registerHabitat;
  listBlueprintCatalog?: typeof listBlueprintCatalog;
  getBlueprint?: typeof getBlueprint;
  listResourceCatalog?: typeof listResourceCatalog;
  getSolarIrradiance?: typeof getSolarIrradiance;
  scanWorld?: typeof scanWorld;
  getCurrentWorldSector?: typeof getCurrentWorldSector;
  collectWorldResource?: typeof collectWorldResource;
  tickService?: TickService;
  clockController?: KeplerClockController;
  logger?: (line: string) => void;
};

export function createApi(cwd = process.cwd(), dependencies: ApiDependencies = {}): Hono {
  const app = new Hono();
  const register = dependencies.registerHabitat ?? registerHabitat;
  const listBlueprints = dependencies.listBlueprintCatalog ?? listBlueprintCatalog;
  const getOneBlueprint = dependencies.getBlueprint ?? getBlueprint;
  const listResources = dependencies.listResourceCatalog ?? listResourceCatalog;
  const getSolar = dependencies.getSolarIrradiance ?? getSolarIrradiance;
  const scan = dependencies.scanWorld ?? scanWorld;
  const getSector = dependencies.getCurrentWorldSector ?? getCurrentWorldSector;
  const collect = dependencies.collectWorldResource ?? collectWorldResource;
  const logger = dependencies.logger ?? console.log;
  const log = (message: string) => logger(`[habitat-api] ${message}`);
  const kepler = async <T>(method: string, path: string, action: () => Promise<T>, successStatus = 200): Promise<T> => {
    try { const result = await action(); logger(`[kepler] ${method} ${path} -> ${successStatus}`); return result; }
    catch (error) { logger(`[kepler] ${method} ${path} -> error`); throw error; }
  };
  const jsonError = (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) });
  const tickService = dependencies.tickService ?? createTickService({
    cwd,
    getSolar: () => kepler("GET", "/world/solar-irradiance", () => getSolarIrradiance(loadKeplerConfig())),
  });
  const clockController = dependencies.clockController ?? createKeplerClockController({ cwd, tickService });
  const publicRegistration = () => { const registration = readRegistration(cwd); if (!registration) return null; const { apiToken: _secret, ...safe } = registration; return safe; };

  app.use("*", cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }));

  app.use("*", async (c, next) => {
    await next();
    const response = c.res;
    const path = c.req.path;
    let result = String(response.status);

    if (path === "/registration") {
      if (c.req.method === "GET") {
        const body = await response.clone().json() as { registration?: unknown };
        result = body.registration ? "registered" : "not registered";
      } else if (response.ok) {
        result = c.req.method === "DELETE" ? "cleared" : "registered";
      }
    } else if (path === "/modules" && c.req.method === "GET") {
      const body = await response.clone().json().catch(() => null) as { modules?: unknown[] | null } | null;
      result = `${body?.modules?.length ?? 0} modules`;
    } else if (path.startsWith("/catalog/") && response.ok) {
      result = "proxied to Kepler";
    }

    log(`${c.req.method} ${path} -> ${result}`);
    return response;
  });

  app.get("/registration", (c) => {
    return c.json({ registration: publicRegistration() });
  });
  app.post("/registration", async (c) => {
    try {
      const { name } = await c.req.json<{ name?: string }>();
      if (!name) return c.json({ error: "Registration name is required." }, 400);
      const config = loadKeplerConfig();
      const existingRegistration = readRegistration(cwd);
      const existingModules = readModuleState(cwd);
      const habitatUuid = existingRegistration?.habitatUuid ?? crypto.randomUUID();
      const response = await kepler("POST", "/habitats/register", () => register(config, name, habitatUuid), 201);
      const registration = {
        habitatId: response.habitatId,
        habitatUuid,
        displayName: name,
        baseUrl: config.baseUrl,
        tokenSource: config.tokenSource,
        streamUrl: response.streamUrl,
        apiToken: response.apiToken,
        stream: response.stream,
      };
      writeClockState(defaultClockState(), cwd);
      if (existingModules) writeRegistration(registration, cwd);
      else hydrateRegistrationState({ registration, modules: hydrateModulesFromRegistration(response.starterModules, response.blueprints), humans: { humans: response.starterHumans }, alertContract: response.contracts.alerts }, cwd);
      return c.json(publicRegistration(), 201);
    } catch (error) { return c.json(jsonError(error), 502); }
  });
  app.delete("/registration", (c) => { removeRegistration(cwd); removeClockState(cwd); removeModuleState(cwd); removeSimulationState(cwd); removeInventoryState(cwd); removeConstructionState(cwd); removeHumanState(cwd); removeExplorationState(cwd); removeAlertContract(cwd); removeAlertState(cwd); return c.json({ ok: true }); });
  app.get("/state", (c) => c.json({ registration: readRegistration(cwd), modules: readModuleState(cwd), inventory: readInventoryState(cwd), construction: readConstructionState(cwd), simulation: readSimulationState(cwd) }));
  app.put("/state", async (c) => {
    const value = await c.req.json<{ modules?: HabitatModuleState | null; inventory?: HabitatInventoryState | null; construction?: unknown | null; simulation?: unknown | null }>();
    if (value.modules) writeModuleState(value.modules, cwd); else if (value.modules === null) removeModuleState(cwd);
    if (value.inventory) writeInventoryState(value.inventory, cwd); else if (value.inventory === null) removeInventoryState(cwd);
    if (value.construction) writeConstructionState(value.construction as never, cwd); else if (value.construction === null) removeConstructionState(cwd);
    if (value.simulation) writeSimulationState(value.simulation as never, cwd); else if (value.simulation === null) removeSimulationState(cwd);
    return c.json({ ok: true });
  });
  app.get("/modules", (c) => { const value = readModuleState(cwd); return c.json(value); });
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
      const reference = getModuleReference(id, cwd);
      if (reference && moduleHasOccupants(reference.module.id, cwd)) return c.json({ error: `Cannot delete occupied module: ${reference.module.id}` }, 400);
      return deleteModule(id, cwd) ? c.json({ ok: true }) : c.json({ error: `Local module not found: ${id}` }, 404);
    } catch (error) { return c.json(jsonError(error), 400); }
  });
  app.get("/inventory", (c) => c.json(readInventoryState(cwd)));
  app.put("/inventory", async (c) => { const value = await c.req.json<HabitatInventoryState>(); writeInventoryState(value, cwd); return c.json(value); });
  const adjustInventory = async (c: Context, direction: 1 | -1) => {
    const resourceType = c.req.param("resourceType") ?? "";
    try {
      const { quantity } = await c.req.json<{ quantity?: unknown }>();
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
        return c.json({ error: "Inventory quantity must be a positive number." }, 400);
      }

      const inventory = readInventoryState(cwd) ?? { resources: {} };
      const current = inventory.resources[resourceType] ?? 0;
      const next = current + direction * quantity;
      if (next < 0) {
        return c.json({ error: `Insufficient inventory for ${resourceType}.` }, 400);
      }

      const updated = { resources: { ...inventory.resources, [resourceType]: next } };
      writeInventoryState(updated, cwd);
      return c.json(updated);
    } catch (error) { return c.json(jsonError(error), 400); }
  };
  app.post("/inventory/resources/:resourceType", (c) => adjustInventory(c, 1));
  app.delete("/inventory/resources/:resourceType", (c) => adjustInventory(c, -1));
  app.get("/humans", (c) => { try { return c.json({ humans: listHumans(cwd) }); } catch (error) { return c.json(jsonError(error), 400); } });
  app.patch("/humans/:id/location", async (c) => { try { const { moduleId } = await c.req.json<{ moduleId?: string }>(); if (!moduleId) return c.json({ error: "Destination module id is required." }, 400); return c.json(moveHuman(c.req.param("id"), moduleId, cwd)); } catch (error) { return c.json(jsonError(error), 400); } });
  app.get("/eva", (c) => c.json(readExplorationState(cwd)));
  app.post("/eva/deploy", async (c) => { try { const { humanId } = await c.req.json<{ humanId?: string }>(); if (!humanId) return c.json({ error: "Human id is required." }, 400); const state = deployExplorer(humanId, cwd); observeAlert({ condition: "human-outside", severity: "warning", source: "eva", subject: { type: "human", id: humanId } }, cwd); return c.json(state, 201); } catch (error) { return c.json(jsonError(error), 400); } });
  app.post("/eva/move", async (c) => { try { const registration = readRegistration(cwd); if (!registration) return c.json({ error: "No local habitat registration found." }, 400); const { x, y } = await c.req.json<{ x?: unknown; y?: unknown }>(); if (!Number.isInteger(x) || !Number.isInteger(y)) return c.json({ error: "EVA coordinates must be integers." }, 400); const sector = await kepler("GET", "/world/sectors/current", () => getSector(loadKeplerConfig(), registration.habitatId)); return c.json(moveExplorer(x as number, y as number, sector.sector.bounds, cwd)); } catch (error) { return c.json(jsonError(error), 400); } });
  app.post("/eva/dock", (c) => { try { const exploration = readExplorationState(cwd); const result = dockExploration(cwd); if (exploration) { resolveAlert("human-outside", { type: "human", id: exploration.humanId }, cwd); resolveAlert("carrying-capacity", { type: "human", id: exploration.humanId }, cwd); } return c.json(result); } catch (error) { return c.json(jsonError(error), 400); } });
  app.get("/alerts", (c) => c.json(readAlertState(cwd) ?? { alerts: [] }));
  app.post("/alerts/:id/acknowledge", (c) => { try { return c.json(acknowledgeAlert(c.req.param("id"), cwd)); } catch (error) { return c.json(jsonError(error), 400); } });
  app.post("/collect", async (c) => { let validated = false; try { const registration = readRegistration(cwd); if (!registration) return c.json({ error: "No local habitat registration found." }, 400); const { quantityKg } = await c.req.json<{ quantityKg?: unknown }>(); const { state } = validateCollection(quantityKg as number, cwd); validated = true; const response = await kepler("POST", "/world/collect", () => collect(loadKeplerConfig(), { habitatId: registration.habitatId, x: state.x, y: state.y, quantityKg: quantityKg as number })); const exploration = addCarriedResource(response.collection.resourceType, response.collection.collectedKg, cwd); const total = Object.values(exploration.carriedResources).reduce((sum, amount) => sum + amount, 0); if (total >= exploration.maxCapacityKg) observeAlert({ condition: "carrying-capacity", severity: "warning", source: "eva", subject: { type: "human", id: exploration.humanId } }, cwd); return c.json({ ...response, exploration }); } catch (error) { if (validated) observeAlert({ condition: "collection-failure", severity: "warning", source: "collection" }, cwd); return c.json(jsonError(error), validated ? 502 : 400); } });
  app.post("/ticks", async (c) => {
    try {
      const { count } = await c.req.json<{ count?: unknown }>();
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
        return c.json({ error: "Tick count must be a positive integer." }, 400);
      }
      return c.json(await tickService.runManual(count));
    } catch (error) { return c.json(jsonError(error), 400); }
  });
  const clockStatus = () => {
    const state = clockController.status();
    return { ...state, listening: state.mode === "kepler", manualTicksAllowed: state.mode === "manual" };
  };
  app.get("/clock/status", (c) => c.json(clockStatus()));
  app.post("/clock/listen", async (c) => {
    try {
      const { listening } = await c.req.json<{ listening?: unknown }>();
      if (typeof listening !== "boolean") return c.json({ error: "listening must be true or false." }, 400);
      if (listening) await clockController.listenOn(); else await clockController.listenOff();
      return c.json(clockStatus());
    } catch (error) { return c.json(jsonError(error), 400); }
  });
  app.get("/clock/events", (c) => {
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        unsubscribe = clockController.subscribe((event: ClockTickEvent) => {
          controller.enqueue(encoder.encode(`event: planet_tick\ndata: ${JSON.stringify(event)}\n\n`));
        });
      },
      cancel() { unsubscribe(); },
    });
    return c.body(stream, 200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  });
  app.post("/construction/jobs", async (c) => {
    try {
      const { blueprintId } = await c.req.json<{ blueprintId?: string }>();
      if (!blueprintId) return c.json({ error: "Blueprint id is required." }, 400);
      const modules = readModuleState(cwd);
      if (!modules) return c.json({ error: 'No local module state found. Run "habitat register --name \\"<habitat name>\\"" first.' }, 400);
      const started = startConstruction(
        await getBlueprint(loadKeplerConfig(), blueprintId),
        modules,
        readInventoryState(cwd) ?? { resources: {} },
        readConstructionState(cwd),
      );
      writeModuleState(started.moduleState, cwd);
      writeInventoryState(started.inventoryState, cwd);
      writeConstructionState(started.constructionState, cwd);
      return c.json(started, 201);
    } catch (error) { return c.json(jsonError(error), 400); }
  });
  app.post("/construction/jobs/:facilityId/cancel", async (c) => {
    try {
      const facilityId = c.req.param("facilityId");
      const modules = readModuleState(cwd);
      if (!modules) return c.json({ error: 'No local module state found. Run "habitat register --name \\"<habitat name>\\"" first.' }, 400);
      const cancelled = cancelConstruction(modules, readConstructionState(cwd), facilityId);
      writeModuleState(cancelled.moduleState, cwd);
      writeConstructionState(cancelled.constructionState, cwd);
      return c.json(cancelled);
    } catch (error) { return c.json(jsonError(error), 400); }
  });
  app.get("/catalog/blueprints", async (c) => { try { return c.json(await kepler("GET", "/catalog/blueprints", () => listBlueprints(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/catalog/blueprints/:id", async (c) => { try { const id = c.req.param("id"); return c.json(await kepler("GET", `/catalog/blueprints/${id}`, async () => ({ blueprint: await getOneBlueprint(loadKeplerConfig(), id) }))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/catalog/resources", async (c) => { try { return c.json(await kepler("GET", "/catalog/resources", () => listResources(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/solar/irradiance", async (c) => { try { return c.json(await kepler("GET", "/world/solar-irradiance", () => getSolar(loadKeplerConfig()))); } catch (error) { return c.json(jsonError(error), 502); } });
  app.get("/world/scan", async (c) => {
    try {
      const registration = readRegistration(cwd);
      if (!registration) {
        return c.json({ error: 'No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.' }, 400);
      }

      const exploration = readExplorationState(cwd);
      if (!exploration) return c.json({ error: "No human is deployed outside the habitat." }, 400);
      const sensorStrength = parseRangedIntegerQuery(c.req.query("sensorStrength"), 0, 100, "Sensor strength must be an integer from 0 through 100.");
      const radiusTiles = parseRangedIntegerQuery(c.req.query("radiusTiles"), 0, 5, "Radius must be an integer from 0 through 5.");
      return c.json(await kepler("GET", "/world/scan", () => scan(loadKeplerConfig(), { habitatId: registration.habitatId, x: exploration.x, y: exploration.y, sensorStrength, radiusTiles })));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const validationError = message.endsWith("must be an integer.") || message.includes("must be an integer from");
      return c.json({ error: message }, validationError ? 400 : 502);
    }
  });
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

function parseIntegerQuery(value: string | undefined, message: string): number {
  if (value === undefined || !/^-?\d+$/.test(value)) throw new Error(message);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(message);
  return parsed;
}

function parseRangedIntegerQuery(value: string | undefined, minimum: number, maximum: number, message: string): number {
  const parsed = parseIntegerQuery(value, message);
  if (parsed < minimum || parsed > maximum) throw new Error(message);
  return parsed;
}

export async function startServer(): Promise<void> {
  const config = readServerConfig();
  const tickService = createTickService();
  const clockController = createKeplerClockController({ tickService });
  const api = createApi(process.cwd(), { tickService, clockController });
  const distRoot = resolve(process.cwd(), "dist/web");
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/assets/"))) {
        const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const file = Bun.file(resolve(distRoot, relativePath));
        if (await file.exists()) return new Response(file);
      }
      return api.fetch(request);
    },
  });
  await clockController.start();
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await clockController.shutdown();
    server.stop(true);
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  console.log(`[habitat-api] listening on http://${config.host}:${server.port}`);
}
