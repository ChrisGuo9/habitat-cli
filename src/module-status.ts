import type { ModuleReference } from "./state";

export const DISPLAY_STATES = ["offline", "idle", "online", "active", "damaged"] as const;
export type DisplayState = (typeof DISPLAY_STATES)[number];
const DISPLAY_STATE_SET = new Set<string>(DISPLAY_STATES);

export type ModuleStatusRow = {
  moduleName: string;
  state: string;
  powerDrawKw: number;
};

export type ModuleStatusSummary = {
  totalPowerDrawKw: number;
  tickEnergyKwh: number;
};

export function buildModuleStatusRows(references: ModuleReference[]): ModuleStatusRow[] {
  return references.map(({ module }) => {
    return {
      moduleName: module.displayName,
      state: resolveModuleState(module.runtimeAttributes.status),
      powerDrawKw: resolvePowerDrawKw(module.runtimeAttributes.status, module.runtimeAttributes.powerDrawKw),
    };
  });
}

export function summarizeModuleStatus(rows: ModuleStatusRow[]): ModuleStatusSummary {
  const totalPowerDrawKw = roundTo(rows.reduce((sum, row) => sum + row.powerDrawKw, 0));
  return {
    totalPowerDrawKw,
    tickEnergyKwh: roundTo(totalPowerDrawKw / 3600),
  };
}

export function formatModuleStatusTable(rows: ModuleStatusRow[], summary: ModuleStatusSummary): string {
  const moduleWidth = Math.max("MODULE".length, ...rows.map((row) => row.moduleName.length));
  const stateWidth = Math.max("STATE".length, ...rows.map((row) => row.state.length));
  const powerValues = rows.map((row) => formatNumber(row.powerDrawKw));
  const powerWidth = Math.max("POWER DRAW (kW)".length, ...powerValues.map((value) => value.length));

  const lines = [
    `${pad("MODULE", moduleWidth)}  ${pad("STATE", stateWidth)}  ${pad("POWER DRAW (kW)", powerWidth)}`,
    `${"-".repeat(moduleWidth)}  ${"-".repeat(stateWidth)}  ${"-".repeat(powerWidth)}`,
  ];

  rows.forEach((row, index) => {
    lines.push(
      `${pad(row.moduleName, moduleWidth)}  ${pad(row.state, stateWidth)}  ${pad(formatNumber(row.powerDrawKw), powerWidth)}`,
    );
  });

  lines.push(`totalPowerDrawKw=${formatNumber(summary.totalPowerDrawKw)}`);
  lines.push(`tickEnergyKwh=${formatNumber(summary.tickEnergyKwh)}`);
  return `${lines.join("\n")}\n`;
}

export function resolveModuleState(value: unknown): DisplayState {
  if (typeof value === "string" && DISPLAY_STATE_SET.has(value)) {
    return value as DisplayState;
  }

  return "idle";
}

export function resolvePowerDrawKw(statusValue: unknown, powerDrawValue: unknown): number {
  const state = resolveModuleState(statusValue);
  const configuredPowerDrawKw = getNumericAttribute(powerDrawValue);

  if (state === "offline" || state === "damaged") {
    return 0;
  }

  return configuredPowerDrawKw;
}

export function isDisplayState(value: string): value is DisplayState {
  return DISPLAY_STATE_SET.has(value);
}

function getNumericAttribute(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

export function formatPowerDrawKw(value: number): string {
  return formatNumber(value);
}

function roundTo(value: number): number {
  return Number(value.toFixed(6));
}

export function invalidStatusMessage(value: string): string {
  return `Invalid module status: ${value}. Expected one of: ${DISPLAY_STATES.join(", ")}.`;
}
