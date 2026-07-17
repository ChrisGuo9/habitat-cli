import type { Command } from "commander";
import { deployEva, dockEva, getEvaStatus, moveEva } from "../api/client";
import type { HabitatExplorationState } from "../state";

export function registerEvaCommands(program: Command): void {
  const eva = program.command("eva").description("manage extravehicular exploration");
  eva.command("status").action(async () => run(async () => print(await getEvaStatus(), program)));
  eva.command("deploy").argument("<human-id>").action(async (humanId) => run(async () => print(await deployEva(humanId), program)));
  eva.command("move").argument("<x>").argument("<y>").action(async (x, y) => run(async () => {
    if (!/^-?\d+$/.test(x) || !/^-?\d+$/.test(y)) throw new Error("EVA coordinates must be integers.");
    print(await moveEva(Number(x), Number(y)), program);
  }));
  eva.command("dock").action(async () => run(async () => { await dockEva(); console.log("Explorer docked and carried resources transferred to inventory."); }));
}
function print(state: HabitatExplorationState | null, program: Command) {
  if (program.opts<{ json?: boolean }>().json) return console.log(JSON.stringify(state));
  if (!state) return console.log("No human is deployed.");
  console.log(`humanId=${state.humanId}`); console.log(`position=${state.x}, ${state.y}`); console.log(`capacityKg=${state.maxCapacityKg}`);
  console.log(`carried=${Object.entries(state.carriedResources).map(([k, v]) => `${k}:${v}kg`).join(", ") || "none"}`);
}
async function run(action: () => Promise<void>) { try { await action(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; } }
