#!/usr/bin/env bun

import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { loadKeplerConfig } from "./config";
import { getHabitatRegistration, registerHabitat } from "./kepler";
import {
  hydrateModulesFromRegistration,
  readRegistration,
  removeModuleState,
  removeRegistration,
  writeModuleState,
  writeRegistration,
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

      console.log(`Removed local habitat registration for ${registration.displayName}`);
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
