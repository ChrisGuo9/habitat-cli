import { Command } from "commander";
import { readInventoryState, removeInventoryState, writeInventoryState } from "../state";

export function registerInventoryCommands(program: Command): void {
  const inventoryCommand = program
    .command("inventory")
    .description("manage local habitat inventory");

  inventoryCommand
    .command("list")
    .description("list local inventory resources")
    .action(() => {
      try {
        const inventory = readInventoryState() ?? { resources: {} };
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
    .command("set")
    .description("set a local inventory resource amount")
    .argument("<resource-type>", "resource type")
    .argument("<amount>", "resource amount")
    .action((resourceType: string, amount: string) => {
      try {
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
          throw new Error("Inventory amount must be a non-negative number.");
        }

        const inventory = readInventoryState() ?? { resources: {} };
        writeInventoryState(
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
    .action(() => {
      try {
        removeInventoryState();
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
