import type { Command } from "commander";
import { acknowledgeAlertViaApi, getAlerts } from "../api/client";
export function registerAlertCommands(program: Command): void {
  const alert = program.command("alert").description("inspect operational alerts");
  alert.command("list").action(async () => run(async () => { const state = await getAlerts(); if (program.opts<{ json?: boolean }>().json) return console.log(JSON.stringify(state.alerts)); console.log("ID  STATUS  SEVERITY  SOURCE  COUNT  SUBJECT"); for (const item of state.alerts) console.log(`${item.id}  ${item.status}  ${item.severity}  ${item.source}  ${item.occurrenceCount}  ${item.subject ? `${item.subject.type}:${item.subject.id}` : "-"}`); }));
  alert.command("acknowledge").argument("<alert-id>").action(async (id) => run(async () => { await acknowledgeAlertViaApi(id); console.log(`Acknowledged alert ${id}`); }));
}
async function run(action: () => Promise<void>) { try { await action(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; } }
