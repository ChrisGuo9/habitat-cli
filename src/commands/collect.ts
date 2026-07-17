import type { Command } from "commander";
import { collectViaApi } from "../api/client";
export function registerCollectCommand(program: Command): void {
  program.command("collect").description("collect material at the explorer position").argument("<quantity-kg>").action(async (value) => {
    try { if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error("Collection quantity must be a positive whole number of kilograms."); const result = await collectViaApi(Number(value)); console.log(program.opts<{ json?: boolean }>().json ? JSON.stringify(result) : `Collected ${value} kg.`); }
    catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
  });
}
