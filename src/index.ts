#!/usr/bin/env bun

import { Command } from "commander";
import { apiRequest, cancelConstructionViaApi, createModuleViaApi, deleteModuleViaApi, getApiState, getBlueprintViaApi as getBlueprint, getModule as getModuleViaApi, getModuleReferences, getRegistration, getSolarViaApi as getSolarIrradiance, registerViaApi as registerHabitat, runTicksViaApi, startConstructionViaApi, unregisterViaApi, updateModuleViaApi } from "./api/client";
import { runConstructionDryRun } from "./construction";
import { registerInventoryCommands } from "./commands/construction";
import { registerCatalogCommands } from "./commands/catalog";
import { registerScanCommand } from "./commands/scan";
import { registerClockCommands } from "./commands/clock";
import { registerHumanCommands } from "./commands/humans";
import { registerEvaCommands } from "./commands/eva";
import { registerCollectCommand } from "./commands/collect";
import { registerAlertCommands } from "./commands/alerts";
import {
  buildModuleStatusRows,
  formatModuleStatusTable,
  formatPowerDrawKw,
  invalidStatusMessage,
  isDisplayState,
  resolvePowerDrawKw,
  summarizeModuleStatus,
} from "./module-status";
const program = new Command();

program
  .name("habitat")
  .description("Register a local habitat with Kepler and inspect its registration status.")
  .version("0.1.0", "-v, --version", "show the current version")
  .showSuggestionAfterError(false)
  .option("--json", "print machine-readable JSON")
  .option("--jsonl", "print machine-readable JSON Lines for streaming commands")
  .helpOption("-h, --help", "show help");

program
  .command("register")
  .description("register this habitat with Kepler")
  .requiredOption("--name <name>", "habitat display name")
  .action(async (options: { name: string }) => {
    try {
      const registration = await registerHabitat(options.name);

      printSection("Registration", [
        ["displayName", options.name],
        ["habitatId", registration?.habitatId ?? "unknown"],
        ["habitatUuid", registration?.habitatUuid ?? "unknown"],
      ]);
    } catch (error) {
      exitWithError(error);
    }
  });

program
  .command("status")
  .description("show the current Kepler registration status")
  .action(async () => {
    try {
      const registration = await getRegistration();
      if (!registration) {
        throw new Error('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      const response = await apiRequest<{ habitat: { status: string; catalogVersion: string; habitatSlug: string; lastSeenAt?: string | null } }>("/habitat/status");
      const { habitat } = response;
      const state = await getApiState();

      if (program.opts<{ json?: boolean }>().json) {
        console.log(JSON.stringify({ registration, habitat, modules: state.modules?.modules.length ?? 0 }));
        return;
      }

      printSection("Habitat Status", [
        ["displayName", registration.displayName],
        ["habitatId", registration.habitatId],
        ["habitatUuid", registration.habitatUuid],
        ["status", habitat.status],
        ["catalogVersion", habitat.catalogVersion],
        ["habitatSlug", habitat.habitatSlug],
        ["lastSeenAt", habitat.lastSeenAt ?? "never"],
        ["modules", String(state.modules?.modules.length ?? 0)],
        ["streamUrl", registration.streamUrl ?? "not available"],
        ["apiToken", registration.apiToken ?? "not available"],
        ["protocolVersion", registration.stream?.protocolVersion ?? "not available"],
        ["subscriptions", registration.stream?.subscriptions.join(", ") ?? "not available"],
        ["registrationCurrentTick", registration.stream ? String(registration.stream.currentTick) : "not available"],
        ["tickIntervalMs", registration.stream ? String(registration.stream.tickIntervalMs) : "not available"],
        ["ticksPerPulse", registration.stream ? String(registration.stream.ticksPerPulse) : "not available"],
        ["registrationClockStatus", registration.stream?.status ?? "not available"],
      ]);
    } catch (error) {
      exitWithError(error);
    }
  });

program
  .command("unregister")
  .description("remove the local habitat registration")
  .action(async () => {
    try {
      const registration = await getRegistration();
      if (!registration) {
        throw new Error('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      await unregisterViaApi();
      console.log(`Removed local habitat registration for ${registration.displayName}`);
    } catch (error) {
      exitWithError(error);
    }
  });

const solarCommand = program.command("solar").description("inspect current solar conditions");

solarCommand
  .command("status")
  .description("show current Kepler solar irradiance")
  .action(async () => {
    try {
      const response = await getSolarIrradiance();
      printSection("Solar Status", [
        ["wPerM2", String(response.solarIrradiance.wPerM2)],
        ["condition", response.solarIrradiance.condition],
      ]);
    } catch (error) {
      exitWithError(error);
    }
  });

program
  .command("tick")
  .description("advance the local habitat simulation by one-second ticks")
  .argument("<count>", "number of ticks to run")
  .action(async (count: string) => {
    try {
      const tickCount = parseTickCount(count);
      const registration = await getRegistration();
      if (!registration) {
        throw new Error('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      const result = await runTicksViaApi(tickCount);

      printSection("Tick", [
        ["requestedTicks", String(result.summary.requestedTicks)],
        ["completedTicks", String(result.summary.completedTicks)],
        ["blockedTicks", String(result.summary.blockedTicks)],
        ["powerBlockedTicks", String(result.summary.powerBlockedTicks)],
        ["currentTick", String(result.simulationState.currentTick)],
        ["solarIrradianceWPerM2", String(result.solarIrradiance.wPerM2)],
        ["solarCondition", result.solarIrradiance.condition],
        ["consumedKwh", String(result.summary.consumedKwh)],
        ["generatedKwh", String(result.summary.generatedKwh)],
        ["storedEnergyKwh", String(result.summary.storedEnergyKwh)],
        ["powerAvailability", result.summary.storedEnergyKwh > 0 ? "available" : "unavailable"],
        [
          "powerExplanation",
          result.summary.storedEnergyKwh > 0
            ? "Battery energy is available for powered work."
            : "No usable battery energy is available; powered work is blocked.",
        ],
        ["constructionCompleted", String(result.summary.constructionCompleted)],
        [
          "constructionProgress",
          result.constructionState.activeJob
            ? formatProgress(result.constructionState.activeJob.totalBuildTicks, result.constructionState.activeJob.remainingBuildTicks)
            : result.summary.constructionCompleted
              ? "100% (completed)"
              : "no active construction",
        ],
      ]);
    } catch (error) {
      exitWithError(error);
    }
  });

program
  .command("construct")
  .description("construct a local habitat module from a blueprint")
  .argument("<blueprint-id>", "blueprint id")
  .option("--dry-run", "show whether construction can start without changing state")
  .action(async (blueprintId: string, options: { dryRun?: boolean }) => {
    try {
      const registration = await getRegistration();
      if (!registration) {
        throw new Error('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      const { blueprint } = await getBlueprint(blueprintId);
      const state = await getApiState();
      const moduleState = state.modules;
      if (!moduleState) {
        throw new Error('No local module state found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      const inventory = state.inventory ?? { resources: {} };
      if (options.dryRun) {
        const report = runConstructionDryRun(blueprint, moduleState.modules, inventory);
        printConstructionDryRun(report);
        return;
      }

      const started = await startConstructionViaApi(blueprintId);
      printConstructionStart(started);
    } catch (error) {
      exitWithError(error);
    }
  });

const constructionCommand = program.command("construction").description("inspect local construction jobs");

constructionCommand
  .command("status")
  .description("show active construction jobs")
  .action(async () => {
    try {
      const { construction, modules } = await getApiState();
      const jobs = construction?.activeJob ? [construction.activeJob] : [];

      if (jobs.length === 0) {
        console.log("No active construction jobs.");
        return;
      }

      jobs.forEach((job, index) => {
        const facility = modules?.modules.find((module) => module.id === job.facilityModuleId);
        const facilityBusy = Boolean(facility?.runtimeAttributes.busy || facility?.runtimeAttributes.activeJobId);
        printSection(`Construction Job ${index + 1}`, [
          ["blueprintId", job.blueprintId],
          ["outputModuleId", job.futureModuleId],
          ["facilityModuleId", job.facilityModuleId],
          ["facilityDeclaredState", String(facility?.runtimeAttributes.status ?? "unknown")],
          ["facilityEffectiveState", facility ? effectiveModuleState(facility) : "missing"],
          ["facilityAvailable", String(!facilityBusy)],
          ["totalBuildTicks", String(job.totalBuildTicks)],
          ["remainingBuildTicks", String(job.remainingBuildTicks)],
          ["progress", formatProgress(job.totalBuildTicks, job.remainingBuildTicks)],
          ["state", "active"],
        ]);
      });
    } catch (error) {
      exitWithError(error);
    }
  });

constructionCommand
  .command("cancel")
  .description("cancel an active construction job on a facility")
  .argument("<facility-id>", "facility alias or local module id")
  .action(async (facilityId: string) => {
    try {
      const facility = await getModuleViaApi(facilityId);
      const result = await cancelConstructionViaApi(facility.id);
      printSection("Construction Cancelled", [
        ["facilityId", facility.id],
        ["blueprintId", result.job.blueprintId],
        ["outputModuleId", result.job.futureModuleId],
        ["remainingBuildTicks", String(result.job.remainingBuildTicks)],
        ["materialsRefunded", "false"],
      ]);
      console.warn("Warning: spent construction materials were not refunded.");
    } catch (error) {
      exitWithError(error);
    }
  });

const moduleCommand = program.command("module").description("manage local habitat modules");
const powerCommand = program.command("power").description("inspect local habitat power");
registerCatalogCommands(program);
registerScanCommand(program);
registerClockCommands(program);
registerInventoryCommands(program);
registerHumanCommands(program);
registerEvaCommands(program);
registerCollectCommand(program);
registerAlertCommands(program);

powerCommand
  .command("overview")
  .description("show current power draw and stored energy")
  .action(async () => {
    try {
      const summary = summarizeModuleStatus(buildModuleStatusRows(await getModuleReferences()));
      printSection("Power Overview", [
        ["totalPowerDrawKw", String(summary.totalPowerDrawKw)],
        ["tickEnergyKwh", String(summary.tickEnergyKwh)],
        ["storedEnergyKwh", String(summary.storedEnergyKwh)],
        ["batteryCapacityKwh", String(summary.batteryCapacityKwh)],
        ["powerAvailability", summary.storedEnergyKwh > 0 ? "available" : "unavailable"],
      ]);
    } catch (error) {
      exitWithError(error);
    }
  });

moduleCommand
  .command("list")
  .description("list local habitat modules")
  .action(async () => {
    try {
      const references = await getModuleReferences();
      printTable(["ALIAS", "BLUEPRINT", "DISPLAY NAME"], references.map(({ alias, module }) => [alias, module.blueprintId, module.displayName]));
    } catch (error) {
      exitWithError(error);
    }
  });

moduleCommand
  .command("status")
  .description("show local habitat module states and current power draw")
  .action(async () => {
    try {
      const rows = buildModuleStatusRows(await getModuleReferences());
      const summary = summarizeModuleStatus(rows);
      process.stdout.write(formatModuleStatusTable(rows, summary));
    } catch (error) {
      exitWithError(error);
    }
  });

moduleCommand
  .command("set-status")
  .description("set one local habitat module runtime status")
  .argument("<id>", "module id")
  .argument("<status>", "module runtime status")
  .action(async (id: string, status: string) => {
    try {
      if (!isDisplayState(status)) {
        throw new Error(invalidStatusMessage(status));
      }

      const module = await updateModuleViaApi(id, {
        runtimeAttributes: { ...(await getModuleViaApi(id)).runtimeAttributes, status },
      });
      if (!module) {
        throw new Error(`Local module not found: ${id}`);
      }

      const powerDrawKw = resolvePowerDrawKw(module.runtimeAttributes.status, module.runtimeAttributes.powerDrawKw);
      printSection("Module Status", [
        ["moduleId", id],
        ["status", status],
        ["powerDrawKw", formatPowerDrawKw(powerDrawKw)],
      ]);
    } catch (error) {
      exitWithError(error);
    }
  });

moduleCommand
  .command("show")
  .description("show one local habitat module")
  .argument("<id>", "module id")
  .action(async (id: string) => {
    try {
      const module = await getModuleViaApi(id);
      const references = await getModuleReferences();
      const reference = references.find(({ module: candidate }) => candidate.id === module.id);
      printModule(reference?.alias ?? id, module, references);
    } catch (error) {
      exitWithError(error);
    }
  });

moduleCommand
  .command("create")
  .description("create a local habitat module")
  .requiredOption("--blueprint-id <blueprintId>", "module blueprint id")
  .requiredOption("--name <name>", "module display name")
  .option("--connect-to <moduleId>", "connected module id", collectValues, [])
  .option("--capability <capability>", "module capability", collectValues, [])
  .option("--runtime-attribute <key=value>", "runtime attribute entry", collectValues, [])
  .action(
    async (options: {
      blueprintId: string;
      name: string;
      connectTo: string[];
      capability: string[];
      runtimeAttribute: string[];
    }) => {
      try {
        const module = await createModuleViaApi({
          blueprintId: options.blueprintId,
          displayName: options.name,
          connectedTo: options.connectTo,
          runtimeAttributes: parseKeyValueEntries(options.runtimeAttribute),
          capabilities: options.capability,
        });

        printSection("Created Module", [
          ["alias", (await getModuleReferences()).find(({ module: candidate }) => candidate.id === module.id)?.alias ?? "unknown"],
          ["id", module.id],
        ]);
      } catch (error) {
        exitWithError(error);
      }
    },
  );

moduleCommand
  .command("update")
  .description("update a local habitat module")
  .argument("<id>", "module id")
  .option("--blueprint-id <blueprintId>", "module blueprint id")
  .option("--name <name>", "module display name")
  .option("--connect-to <moduleId>", "connected module id", collectValues)
  .option("--capability <capability>", "module capability", collectValues)
  .option("--runtime-attribute <key=value>", "runtime attribute entry", collectValues)
  .action(
    async (
      id: string,
      options: {
        blueprintId?: string;
        name?: string;
        connectTo?: string[];
        capability?: string[];
        runtimeAttribute?: string[];
      },
    ) => {
      try {
        const module = await updateModuleViaApi(
          id,
          {
            blueprintId: options.blueprintId,
            displayName: options.name,
            connectedTo: options.connectTo,
            runtimeAttributes: options.runtimeAttribute
              ? parseKeyValueEntries(options.runtimeAttribute)
              : undefined,
            capabilities: options.capability,
          },
        );

        if (!module) {
          throw new Error(`Local module not found: ${id}`);
        }

        printSection("Updated Module", [["id", id]]);
      } catch (error) {
        exitWithError(error);
      }
    },
  );

moduleCommand
  .command("delete")
  .description("delete a local habitat module")
  .argument("<id>", "module id")
  .action(async (id: string) => {
    try {
      await deleteModuleViaApi(id);

      printSection("Deleted Module", [["id", id]]);
    } catch (error) {
      exitWithError(error);
    }
  });

program.parseAsync(process.argv);

function exitWithError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}

function collectValues(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function parseKeyValueEntries(entries: string[]): Record<string, unknown> {
  const parsedEntries = entries.map((entry) => {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`Invalid runtime attribute: ${entry}. Expected key=value.`);
    }

    const key = entry.slice(0, separatorIndex).trim();
    const rawValue = entry.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(`Invalid runtime attribute: ${entry}. Expected key=value.`);
    }

    return [key, parseRuntimeValue(rawValue)] as const;
  });

  return Object.fromEntries(parsedEntries);
}

function parseRuntimeValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;

  const numericValue = Number(value);
  if (value !== "" && Number.isFinite(numericValue)) {
    return numericValue;
  }

  return value;
}

function parseTickCount(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error("Tick count must be a positive integer.");
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Tick count must be a positive integer.");
  }

  return parsed;
}

function printModule(
  alias: string,
  module: {
    id: string;
    blueprintId: string;
    displayName: string;
    connectedTo: string[];
    runtimeAttributes: Record<string, unknown>;
    capabilities: string[];
  },
  references: Array<{ module: { runtimeAttributes: Record<string, unknown> } }>,
): void {
  const declaredState = String(module.runtimeAttributes.status ?? "idle");
  const effectiveState = effectiveModuleState(module);
  const storedEnergy = sumStoredEnergy(references);
  const batteryCapacity = sumBatteryCapacity(references);
  const rows = [
    ["alias", alias],
    ["id", module.id],
    ["blueprintId", module.blueprintId],
    ["displayName", module.displayName],
    ["connectedTo", module.connectedTo.join(", ") || "-"],
    ["status", declaredState],
    ["declaredState", declaredState],
    ["effectiveState", effectiveState],
    ["crewCapacity", String(module.runtimeAttributes.crewCapacity ?? "-")],
    ["powerDrawKw", formatModulePowerDraw(module.runtimeAttributes.powerDrawKw)],
    ["powerAvailability", storedEnergy > 0 ? "available" : "unavailable"],
    ["batteryCharge", formatEnergy(storedEnergy, batteryCapacity)],
    ["activeJobId", String(module.runtimeAttributes.activeJobId ?? "-")],
    ["fabricatorAvailable", String(!Boolean(module.runtimeAttributes.busy || module.runtimeAttributes.activeJobId))],
  ] as const;
  const keyWidth = Math.max(...rows.map(([key]) => key.length));

  console.log(`${pad("FIELD", keyWidth)}  VALUE`);
  console.log(`${"-".repeat(keyWidth)}  -----`);
  for (const [key, value] of rows) {
    console.log(`${pad(key, keyWidth)}  ${value}`);
  }

  printSection("Runtime Attributes", Object.entries(module.runtimeAttributes).map(([key, value]) => [key, formatValue(value)]));
  printSection("capabilities", [["list", module.capabilities.join(", ") || "None declared"]]);
  if (batteryCapacity > 0 && storedEnergy <= 0) {
    console.log("Power Note");
    console.log("----------");
    console.log("No usable battery energy is available. Powered work cannot advance until a battery has charge.");
  }
}

function effectiveModuleState(module: { runtimeAttributes: Record<string, unknown> }): string {
  const declaredState = String(module.runtimeAttributes.status ?? "idle");
  if (declaredState === "offline" || declaredState === "damaged") return declaredState;
  if (Boolean(module.runtimeAttributes.busy || module.runtimeAttributes.activeJobId)) return "busy";
  return declaredState;
}

function sumStoredEnergy(references: Array<{ module: { runtimeAttributes: Record<string, unknown> } }>): number {
  return Number(
    references
      .reduce((sum, reference) => sum + numericValue(reference.module.runtimeAttributes.currentEnergyKwh), 0)
      .toFixed(6),
  );
}

function sumBatteryCapacity(references: Array<{ module: { runtimeAttributes: Record<string, unknown> } }>): number {
  return Number(
    references
      .reduce((sum, reference) => sum + numericValue(reference.module.runtimeAttributes.energyStorageKwh), 0)
      .toFixed(6),
  );
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatEnergy(charge: number, capacity: number): string {
  return capacity > 0 ? `${charge} / ${capacity} kWh` : "not a battery";
}

function printConstructionDryRun(report: {
  blueprintId: string;
  displayName: string;
  valid: boolean;
  published: boolean;
  buildable: boolean;
  requiredFacilityExists: boolean;
  facilityOnline: boolean;
  facilityAvailable: boolean;
  supplyCacheOnline: boolean;
  prerequisitesMet: boolean;
  inventorySufficient: boolean;
  buildTicks: number;
  moduleToCreate: { itemType?: string; moduleType?: string; quantity?: number };
  resourcesToSpend: Record<string, number>;
  canStart: boolean;
  reasons: string[];
}): void {
  printSection("Construction Dry Run", [
    ["blueprintId", report.blueprintId],
    ["displayName", report.displayName],
    ["valid", String(report.valid)],
    ["published", String(report.published)],
    ["buildable", String(report.buildable)],
    ["requiredFacilityExists", String(report.requiredFacilityExists)],
    ["facilityOnline", String(report.facilityOnline)],
    ["facilityAvailable", String(report.facilityAvailable)],
    ["supplyCacheOnline", String(report.supplyCacheOnline)],
    ["prerequisitesMet", String(report.prerequisitesMet)],
    ["inventorySufficient", String(report.inventorySufficient)],
    ["moduleToCreate", formatValue(report.moduleToCreate)],
    ["resourcesToSpend", formatValue(report.resourcesToSpend)],
    ["buildTicks", String(report.buildTicks)],
    ["canStart", String(report.canStart)],
  ]);
  if (report.reasons.length > 0) {
    printList("Reasons", report.reasons);
  }
}

function printConstructionStart(result: {
  report: {
    blueprintId: string;
    displayName: string;
    canStart: boolean;
    buildTicks: number;
    moduleToCreate: { itemType?: string; moduleType?: string; quantity?: number };
    resourcesToSpend: Record<string, number>;
  };
  constructionState: {
    activeJob: {
      futureModuleId: string;
      facilityModuleId: string;
      totalBuildTicks: number;
      remainingBuildTicks: number;
    } | null;
  };
}): void {
  printSection("Construction Started", [
    ["blueprintId", result.report.blueprintId],
    ["displayName", result.report.displayName],
    ["canStart", String(result.report.canStart)],
    ["buildTicks", String(result.report.buildTicks)],
    ["moduleType", result.report.moduleToCreate.moduleType ?? "-"],
    ["quantity", String(result.report.moduleToCreate.quantity ?? "-")],
  ]);

  printSection(
    "Resources Spent",
    Object.entries(result.report.resourcesToSpend).map(([resource, amount]) => [resource, String(amount)]),
  );

  const job = result.constructionState.activeJob;
  if (job) {
    printSection("Construction Job", [
      ["outputModuleId", job.futureModuleId],
      ["facilityModuleId", job.facilityModuleId],
      ["totalBuildTicks", String(job.totalBuildTicks)],
      ["remainingBuildTicks", String(job.remainingBuildTicks)],
      ["state", "active"],
    ]);
  }
}

function formatModulePowerDraw(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "-";

  const entries = Object.entries(value)
    .filter(([, amount]) => typeof amount === "number" && Number.isFinite(amount))
    .map(([state, amount]) => `${state}:${Number(amount.toFixed(6)).toString()}`);

  return entries.length > 0 ? entries.join(", ") : "-";
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function printSection(title: string, rows: ReadonlyArray<readonly [string, string]>): void {
  const keyWidth = Math.max(title.length, ...rows.map(([key]) => key.length));
  console.log(title);
  console.log(`${"-".repeat(keyWidth)}`);
  for (const [key, value] of rows) {
    console.log(`${pad(key, keyWidth)}  ${value}`);
  }
}

function printTable(headers: readonly [string, string, string], rows: Array<readonly [string, string, string]>): void {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  console.log(`${pad(headers[0], widths[0])}  ${pad(headers[1], widths[1])}  ${pad(headers[2], widths[2])}`);
  console.log(`${"-".repeat(widths[0])}  ${"-".repeat(widths[1])}  ${"-".repeat(widths[2])}`);
  for (const row of rows) {
    console.log(`${pad(row[0], widths[0])}  ${pad(row[1], widths[1])}  ${pad(row[2], widths[2])}`);
  }
}

function printList(title: string, values: string[]): void {
  printSection(title, values.map((value, index) => [String(index + 1), value]));
}

function formatRecord(value: Record<string, unknown>): string {
  const entries = Object.entries(value).map(([key, entry]) => `${key}=${formatValue(entry)}`);
  return entries.length > 0 ? entries.join(", ") : "-";
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => formatValue(entry)).join(", ")}]`;
  if (value && typeof value === "object") return `{${formatRecord(value as Record<string, unknown>)}}`;
  return String(value);
}

function formatProgress(totalBuildTicks: number, remainingBuildTicks: number): string {
  if (totalBuildTicks <= 0) {
    return "-";
  }

  const completed = Math.max(0, totalBuildTicks - remainingBuildTicks);
  const percent = Math.min(100, Math.max(0, (completed / totalBuildTicks) * 100));
  return `${Number(percent.toFixed(1)).toString()}%`;
}
