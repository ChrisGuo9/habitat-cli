import type { Command } from "commander";
import { getClockStatus, setClockListening, watchClockEvents } from "../api/client";
import type { ApiClockEvent, ApiClockStatus } from "../api/types";

type GlobalOptions = { json?: boolean; jsonl?: boolean };

export function registerClockCommands(program: Command): void {
  const clock = program.command("clock").description("control the Habitat simulation clock");

  clock.command("status").description("show manual or Kepler clock status").action(async () => {
    await run(async () => printStatus(await getClockStatus(), program.opts<GlobalOptions>()));
  });

  const listen = clock.command("listen").description("turn Kepler tick listening on or off");
  listen.command("on").description("enable Kepler tick listening").action(async () => {
    await run(async () => printStatus(await setClockListening(true), program.opts<GlobalOptions>()));
  });
  listen.command("off").description("disable Kepler tick listening").action(async () => {
    await run(async () => printStatus(await setClockListening(false), program.opts<GlobalOptions>()));
  });

  clock.command("watch").description("watch future Kepler ticks received by the local Habitat API").action(async () => {
    await run(async () => {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once("SIGINT", stop);
      try {
        await watchClockEvents((event) => printEvent(event, program.opts<GlobalOptions>()), controller.signal);
      } finally {
        process.off("SIGINT", stop);
      }
    });
  });
}

function printStatus(status: ApiClockStatus, options: GlobalOptions): void {
  if (options.json) { console.log(JSON.stringify(status)); return; }
  const rows: Array<[string, string]> = [
    ["mode", status.mode], ["listening", status.listening ? "on" : "off"],
    ["manualTicksAllowed", String(status.manualTicksAllowed)], ["connectionState", status.connectionState],
    ["lastKeplerTick", status.lastKeplerTick === null ? "never" : String(status.lastKeplerTick)],
    ["lastAdvancedBy", status.lastAdvancedBy === null ? "never" : String(status.lastAdvancedBy)],
    ["lastConnectedAt", status.lastConnectedAt ?? "never"], ["lastMessageAt", status.lastMessageAt ?? "never"],
  ];
  if (status.lastConnectionError) rows.push(["lastConnectionError", status.lastConnectionError]);
  printSection("Clock Status", rows);
}

function printEvent(event: ApiClockEvent, options: GlobalOptions): void {
  if (options.jsonl) { console.log(JSON.stringify(event)); return; }
  console.log(`tick=${event.tick} advancedBy=${event.advancedBy} issuedAt=${event.issuedAt} applied=${event.applied}`);
}

function printSection(title: string, rows: Array<[string, string]>): void {
  const width = Math.max(title.length, ...rows.map(([key]) => key.length));
  console.log(title);
  console.log("-".repeat(width));
  for (const [key, value] of rows) console.log(`${key.padEnd(width)}  ${value}`);
}

async function run(action: () => Promise<void>): Promise<void> {
  try { await action(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
