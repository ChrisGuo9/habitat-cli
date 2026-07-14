import { Command } from "commander";
import { addInventory, getInventory, putInventory, removeInventory } from "../api/client";

export function registerInventoryCommands(program: Command): void {
  const inventoryCommand = program
    .command("inventory")
    .description("manage local habitat inventory");

  inventoryCommand
    .command("list")
    .description("list local inventory resources")
    .action(async () => {
      try {
        const inventory = await getInventory() ?? { resources: {} };
        const rows = Object.entries(inventory.resources).map(([resourceType, amount]) => ({
          resourceType,
          amount: formatAmount(amount),
        }));
        printTable(["RESOURCE", "AMOUNT"], rows.map((row) => [row.resourceType, row.amount]));
      } catch (error) {
        exitWithError(error);
      }
    });

  inventoryCommand
    .command("add")
    .description("add resources to local inventory")
    .argument("<resource-type>", "resource type")
    .argument("<quantity>", "resource quantity")
    .action(async (resourceType: string, quantity: string) => {
      try {
        const parsedQuantity = parseQuantity(quantity);
        const inventory = await addInventory(resourceType, parsedQuantity);
        console.log(`resourceType=${resourceType}`);
        console.log(`quantity=${formatAmount(inventory.resources[resourceType] ?? 0)}`);
      } catch (error) { exitWithError(error); }
    });

  inventoryCommand
    .command("remove")
    .description("remove resources from local inventory")
    .argument("<resource-type>", "resource type")
    .argument("<quantity>", "resource quantity")
    .action(async (resourceType: string, quantity: string) => {
      try {
        const parsedQuantity = parseQuantity(quantity);
        const inventory = await removeInventory(resourceType, parsedQuantity);
        console.log(`resourceType=${resourceType}`);
        console.log(`quantity=${formatAmount(inventory.resources[resourceType] ?? 0)}`);
      } catch (error) { exitWithError(error); }
    });

  inventoryCommand
    .command("set")
    .description("set a local inventory resource amount")
    .argument("<resource-type>", "resource type")
    .argument("<amount>", "resource amount")
    .action(async (resourceType: string, amount: string) => {
      try {
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
          throw new Error("Inventory amount must be a non-negative number.");
        }

        const inventory = await getInventory() ?? { resources: {} };
        await putInventory(
          {
            resources: {
              ...inventory.resources,
              [resourceType]: parsedAmount,
            },
          },
        );

        console.log(`resourceType=${resourceType}`);
        console.log(`amount=${parsedAmount}`);
      } catch (error) {
        exitWithError(error);
      }
    });

  inventoryCommand
    .command("clear")
    .description("remove local inventory state")
    .action(async () => {
      try {
        await putInventory({ resources: {} });
        console.log("Removed local inventory state");
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

function formatAmount(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function parseQuantity(value: string): number {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Inventory quantity must be a positive number.");
  }
  return quantity;
}

function printTable(headers: readonly [string, string], rows: Array<readonly [string, string]>): void {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  console.log(`${pad(headers[0], widths[0])}  ${pad(headers[1], widths[1])}`);
  console.log(`${"-".repeat(widths[0])}  ${"-".repeat(widths[1])}`);
  for (const row of rows) {
    console.log(`${pad(row[0], widths[0])}  ${pad(row[1], widths[1])}`);
  }
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}
