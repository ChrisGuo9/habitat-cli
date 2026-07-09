#!/usr/bin/env bun

import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { loadKeplerConfig } from "./config";
import { getHabitatRegistration, registerHabitat } from "./kepler";
import {
  buildModuleStatusRows,
  formatModuleStatusTable,
  formatPowerDrawKw,
  invalidStatusMessage,
  isDisplayState,
  resolvePowerDrawKw,
  summarizeModuleStatus,
} from "./module-status";
import { runSimulationTicks } from "./simulation";
import {
  createModule,
  deleteModule,
  getModuleReference,
  hydrateModulesFromRegistration,
  listModuleReferences,
  readOrCreateSimulationState,
  readRegistration,
  readModuleState,
  removeModuleState,
  removeRegistration,
  removeSimulationState,
  updateModule,
  updateModuleStatus,
  writeModuleState,
  writeRegistration,
  writeSimulationState,
} from "./state";

const program = new Command();

program
  .name("habitat")
  .description("Register a local habitat with Kepler and inspect its registration status.")
  .version("0.1.0", "-v, --version", "show the current version")
  .showSuggestionAfterError(false)
  .helpOption("-h, --help", "show help");

program
  .command("register")
  .description("register this habitat with Kepler")
  .requiredOption("--name <name>", "habitat display name")
  .action(async (options: { name: string }) => {
    try {
      const config = loadKeplerConfig();
      const habitatUuid = randomUUID();
      const response = await registerHabitat(config, options.name, habitatUuid);

      writeRegistration({
        habitatId: response.habitatId,
        habitatUuid,
        displayName: options.name,
        baseUrl: config.baseUrl,
        tokenSource: config.tokenSource,
      });

      writeModuleState(hydrateModulesFromRegistration(response.starterModules, response.blueprints));

      console.log(`Registered habitat ${options.name}`);
      console.log(`habitatId=${response.habitatId}`);
      console.log(`habitatUuid=${habitatUuid}`);
      console.log(`starterModules=${response.starterModules.length}`);
      console.log(`blueprints=${response.blueprints.length}`);
    } catch (error) {
      exitWithError(error);
    }
  });

program
  .command("status")
  .description("show the current Kepler registration status")
  .action(async () => {
    try {
      const registration = readRegistration();
      if (!registration) {
        throw new Error('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      const config = loadKeplerConfig();
      const response = await getHabitatRegistration(config, registration.habitatId);
      const { habitat } = response;

      console.log(`displayName=${registration.displayName}`);
      console.log(`habitatId=${registration.habitatId}`);
      console.log(`habitatUuid=${registration.habitatUuid}`);
      console.log(`status=${habitat.status}`);
      console.log(`catalogVersion=${habitat.catalogVersion}`);
      console.log(`habitatSlug=${habitat.habitatSlug}`);
      console.log(`lastSeenAt=${habitat.lastSeenAt ?? "never"}`);
      console.log(`modules=${readModuleState()?.modules.length ?? 0}`);
    } catch (error) {
      exitWithError(error);
    }
  });

program
  .command("unregister")
  .description("remove the local habitat registration")
  .action(() => {
    try {
      const registration = readRegistration();
      if (!registration) {
        throw new Error('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      removeRegistration();
      removeModuleState();
      removeSimulationState();

      console.log(`Removed local habitat registration for ${registration.displayName}`);
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
      const registration = readRegistration();
      if (!registration) {
        throw new Error('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      const moduleState = readModuleState();
      if (!moduleState) {
        throw new Error('No local module state found. Run "habitat register --name \\"<habitat name>\\"" first.');
      }

      const simulationState = readOrCreateSimulationState();
      const result = runSimulationTicks({
        moduleState,
        simulationState,
        tickCount,
      });

      writeModuleState(result.moduleState);
      writeSimulationState(result.simulationState);

      console.log(`ticks=${result.summary.ticks}`);
      console.log(`currentTick=${result.simulationState.currentTick}`);
      console.log(`consumedKwh=${result.summary.consumedKwh}`);
      console.log(`storedEnergyKwh=${result.summary.storedEnergyKwh}`);
    } catch (error) {
      exitWithError(error);
    }
  });

const moduleCommand = program.command("module").description("manage local habitat modules");

moduleCommand
  .command("list")
  .description("list local habitat modules")
  .action(() => {
    try {
      for (const { alias, module } of listModuleReferences()) {
        console.log(`${alias}\t${module.blueprintId}\t${module.displayName}`);
      }
    } catch (error) {
      exitWithError(error);
    }
  });

moduleCommand
  .command("status")
  .description("show local habitat module states and current power draw")
  .action(() => {
    try {
      const rows = buildModuleStatusRows(listModuleReferences());
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
  .action((id: string, status: string) => {
    try {
      if (!isDisplayState(status)) {
        throw new Error(invalidStatusMessage(status));
      }

      const module = updateModuleStatus(id, status);
      if (!module) {
        throw new Error(`Local module not found: ${id}`);
      }

      const powerDrawKw = resolvePowerDrawKw(module.runtimeAttributes.status, module.runtimeAttributes.powerDrawKw);
      console.log(`moduleId=${id}`);
      console.log(`status=${status}`);
      console.log(`powerDrawKw=${formatPowerDrawKw(powerDrawKw)}`);
    } catch (error) {
      exitWithError(error);
    }
  });

moduleCommand
  .command("show")
  .description("show one local habitat module")
  .argument("<id>", "module id")
  .action((id: string) => {
    try {
      const reference = getModuleReference(id);
      if (!reference) {
        throw new Error(`Local module not found: ${id}`);
      }

      printModule(reference.alias, reference.module);
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
    (options: {
      blueprintId: string;
      name: string;
      connectTo: string[];
      capability: string[];
      runtimeAttribute: string[];
    }) => {
      try {
        const module = createModule({
          blueprintId: options.blueprintId,
          displayName: options.name,
          connectedTo: options.connectTo,
          runtimeAttributes: parseKeyValueEntries(options.runtimeAttribute),
          capabilities: options.capability,
        });

        console.log("Created local module");
        console.log(`alias=${getModuleReference(module.id)?.alias ?? "unknown"}`);
        console.log(`id=${module.id}`);
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
    (
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
        const module = updateModule(
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

        console.log(`Updated local module ${id}`);
      } catch (error) {
        exitWithError(error);
      }
    },
  );

moduleCommand
  .command("delete")
  .description("delete a local habitat module")
  .argument("<id>", "module id")
  .action((id: string) => {
    try {
      if (!deleteModule(id)) {
        throw new Error(`Local module not found: ${id}`);
      }

      console.log(`Deleted local module ${id}`);
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
): void {
  console.log(`alias=${alias}`);
  console.log(`id=${module.id}`);
  console.log(`blueprintId=${module.blueprintId}`);
  console.log(`displayName=${module.displayName}`);
  console.log(`connectedTo=${JSON.stringify(module.connectedTo)}`);
  console.log(`runtimeAttributes=${JSON.stringify(module.runtimeAttributes)}`);
  console.log(`capabilities=${JSON.stringify(module.capabilities)}`);
}
