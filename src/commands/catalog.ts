import { Command } from "commander";
import { loadKeplerConfig } from "../config";
import { evaluateConstructionReadiness } from "../construction";
import { getBlueprint, listBlueprintCatalog, listResourceCatalog } from "../kepler";
import { readInventoryState, readModuleState, readRegistration } from "../state";

export function registerCatalogCommands(program: Command): void {
  const blueprintCommand = program
    .command("blueprint")
    .description("inspect the official Kepler blueprint catalog");

  const resourceCommand = program
    .command("resource")
    .description("inspect possible resource types in the Kepler world");

  resourceCommand
    .command("list")
    .description("list possible resource types from Kepler")
    .action(async () => {
      try {
        const config = loadKeplerConfig();
        const response = await listResourceCatalog(config);

        printSection("Resource Catalog", [
          ["catalogVersion", response.catalogVersion],
          ["meaning", "possible resource types in the Kepler world"],
          ["localInventory", "resources this habitat owns later"],
          ["blueprintRequirements", "resources or modules needed to build something later"],
        ]);
        printTable(
          ["RESOURCE TYPE", "DISPLAY NAME", "KIND", "RARITY", "UNIT"],
          response.resources.map((resource) => [
            resource.resourceType,
            resource.displayName,
            resource.kind,
            resource.rarity,
            resource.unit ?? "-",
          ]),
        );
      } catch (error) {
        exitWithError(error);
      }
    });

  blueprintCommand
    .command("list")
    .description("list official blueprints")
    .action(async () => {
      try {
        const config = loadKeplerConfig();
        const response = await listBlueprintCatalog(config);
        const rows = response.blueprints.map((blueprint) => ({
          blueprintId: blueprint.blueprintId,
          displayName: blueprint.displayName,
          status: blueprint.status,
          buildTicks: blueprint.buildTicks,
        }));

        const blueprintWidth = Math.max("BLUEPRINT".length, ...rows.map((row) => row.blueprintId.length));
        const nameWidth = Math.max("DISPLAY NAME".length, ...rows.map((row) => row.displayName.length));
        const statusWidth = Math.max("STATUS".length, ...rows.map((row) => row.status.length));
        const ticksWidth = Math.max(
          "BUILD TICKS".length,
          ...rows.map((row) => String(row.buildTicks).length),
        );

        const lines = [
          `catalogVersion=${response.catalogVersion}`,
          `${pad("BLUEPRINT", blueprintWidth)}  ${pad("DISPLAY NAME", nameWidth)}  ${pad("STATUS", statusWidth)}  ${pad("BUILD TICKS", ticksWidth)}`,
          `${"-".repeat(blueprintWidth)}  ${"-".repeat(nameWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(ticksWidth)}`,
        ];

        for (const row of rows) {
          lines.push(
            `${pad(row.blueprintId, blueprintWidth)}  ${pad(row.displayName, nameWidth)}  ${pad(row.status, statusWidth)}  ${pad(
              String(row.buildTicks),
              ticksWidth,
            )}`,
          );
        }

        process.stdout.write(`${lines.join("\n")}\n`);
      } catch (error) {
        exitWithError(error);
      }
    });

  blueprintCommand
    .command("show")
    .description("show one official blueprint")
    .argument("<blueprint-id>", "blueprint id")
    .action(async (blueprintId: string) => {
      try {
        const config = loadKeplerConfig();
        const blueprint = await getBlueprint(config, blueprintId);
        printBlueprint(blueprint);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Kepler request failed (404)")) {
          exitWithError(new Error(`Blueprint not found: ${blueprintId}`));
        }
        exitWithError(error);
      }
    });

  blueprintCommand
    .command("check")
    .description("check whether a blueprint can be constructed locally")
    .argument("<blueprint-id>", "blueprint id")
    .action(async (blueprintId: string) => {
      try {
        const registration = readRegistration();
        if (!registration) {
          throw new Error('No local habitat registration found. Run "habitat register --name \\"<habitat name>\\"" first.');
        }

        const config = loadKeplerConfig();
        const blueprint = await getBlueprint(config, blueprintId);
        const moduleState = readModuleState();
        const inventory = readInventoryState() ?? { resources: {} };

        if (!moduleState) {
          throw new Error('No local module state found. Run "habitat register --name \\"<habitat name>\\"" first.');
        }

        const readiness = evaluateConstructionReadiness(blueprint, moduleState.modules, inventory);
        printSection("Blueprint Readiness", [
          ["blueprintId", blueprint.blueprintId],
          ["displayName", blueprint.displayName],
          ["published", String(readiness.requirement.published)],
          ["buildable", String(readiness.requirement.buildable)],
          ["ready", String(readiness.ready)],
          ["requiredFacility", formatList(readiness.requirement.requiredFacility)],
          ["requiredCapabilities", formatList(readiness.requirement.requiredCapabilities)],
          ["requiredPrerequisites", formatList(readiness.requirement.requiredPrerequisites)],
          ["requiredMaterials", formatRecord(readiness.requirement.requiredMaterials)],
          ["usablePower", String(readiness.requirement.usablePower)],
        ]);

        if (readiness.issues.length > 0) {
          printList("Issues", readiness.issues);
        }
      } catch (error) {
        exitWithError(error);
      }
    });
}

function exitWithError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}

function printBlueprint(blueprint: {
  id: string;
  blueprintId: string;
  displayName: string;
  description: string;
  status: string;
  output: Record<string, unknown>;
  inputs: Record<string, unknown>;
  buildTicks: number;
  repeatable: boolean;
  prerequisites?: string[];
  unlocks?: string[];
  runtimeAttributes?: Record<string, unknown>;
  capabilities?: string[];
}): void {
  printSection("Blueprint", [
    ["alias", blueprint.blueprintId],
    ["id", blueprint.id],
    ["blueprintId", blueprint.blueprintId],
    ["displayName", blueprint.displayName],
    ["description", blueprint.description],
    ["status", blueprint.status],
    ["buildTicks", String(blueprint.buildTicks)],
    ["repeatable", String(blueprint.repeatable)],
    ["inputs", formatRecord(blueprint.inputs)],
    ["output", formatRecord(blueprint.output)],
    ["prerequisites", formatList(blueprint.prerequisites ?? [])],
    ["unlocks", formatList(blueprint.unlocks ?? [])],
    ["capabilities", formatList(blueprint.capabilities ?? [])],
    ["runtimeAttributes", formatRecord(blueprint.runtimeAttributes ?? {})],
  ]);
}

function printSection(title: string, rows: ReadonlyArray<readonly [string, string]>): void {
  const width = Math.max(title.length, ...rows.map(([key]) => key.length));
  console.log(title);
  console.log(`${"-".repeat(width)}`);
  for (const [key, value] of rows) {
    console.log(`${pad(key, width)}  ${value}`);
  }
}

function printTable(headers: readonly [string, string, string, string, string], rows: Array<readonly [string, string, string, string, string]>): void {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  console.log(`${pad(headers[0], widths[0])}  ${pad(headers[1], widths[1])}  ${pad(headers[2], widths[2])}  ${pad(headers[3], widths[3])}  ${pad(headers[4], widths[4])}`);
  console.log(`${"-".repeat(widths[0])}  ${"-".repeat(widths[1])}  ${"-".repeat(widths[2])}  ${"-".repeat(widths[3])}  ${"-".repeat(widths[4])}`);
  for (const row of rows) {
    console.log(`${pad(row[0], widths[0])}  ${pad(row[1], widths[1])}  ${pad(row[2], widths[2])}  ${pad(row[3], widths[3])}  ${pad(row[4], widths[4])}`);
  }
}

function printList(title: string, values: string[]): void {
  printSection(title, values.map((value, index) => [String(index + 1), value]));
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "-";
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

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}
