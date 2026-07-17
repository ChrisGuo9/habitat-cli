import type { Command } from "commander";
import { getHumans, moveHumanViaApi } from "../api/client";

export function registerHumanCommands(program: Command): void {
  const human = program.command("human").description("manage habitat humans");
  human.command("list").description("list humans and module locations").action(async () => run(async () => {
    const { humans } = await getHumans();
    if (program.opts<{ json?: boolean }>().json) return console.log(JSON.stringify(humans));
    console.log("ID        NAME  MODULE"); console.log("--------  ----  ------");
    for (const item of humans) console.log(`${item.id}  ${item.displayName}  ${item.locationModuleId}`);
  }));
  human.command("move").description("move a human between habitat modules").argument("<human-id>").argument("<module-id>").action(async (humanId, moduleId) => run(async () => {
    const moved = await moveHumanViaApi(humanId, moduleId); console.log(`${moved.displayName} moved to ${moved.locationModuleId}`);
  }));
}
async function run(action: () => Promise<void>) { try { await action(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; } }
