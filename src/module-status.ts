import type { ModuleReference } from "./state";

export const DISPLAY_STATES = ["offline", "idle", "online", "active", "damaged"] as const;
export type DisplayState = (typeof DISPLAY_STATES)[number];
const DISPLAY_STATE_SET = new Set<string>(DISPLAY_STATES);

export type ModuleStatusRow = {
  moduleName: string;
  declaredState: string;
  effectiveState: string;
  powerDrawKw: number;
  storedEnergyKwh: number;
  batteryCapacityKwh: number;
};

export type ModuleStatusSummary = {
  totalPowerDrawKw: number;
  tickEnergyKwh: number;
  storedEnergyKwh: number;
  batteryCapacityKwh: number;
};

export function buildModuleStatusRows(references: ModuleReference[]): ModuleStatusRow[] {
  return references.map(({ module }) => {
    const declaredState = resolveModuleState(module.runtimeAttributes.status);
    return {
      moduleName: module.displayName,
      declaredState,
      effectiveState: module.runtimeAttributes.busy === true || module.runtimeAttributes.activeJobId ? "busy" : declaredState,
      powerDrawKw: resolvePowerDrawKw(module.runtimeAttributes.status, module.runtimeAttributes.powerDrawKw),
      storedEnergyKwh: getNumericAttribute(module.runtimeAttributes.currentEnergyKwh),
      batteryCapacityKwh: getNumericAttribute(module.runtimeAttributes.energyStorageKwh),
    };
  });
}

export function summarizeModuleStatus(rows: ModuleStatusRow[]): ModuleStatusSummary {
  const totalPowerDrawKw = roundTo(rows.reduce((sum, row) => sum + row.powerDrawKw, 0));
  return {
    totalPowerDrawKw,
    tickEnergyKwh: roundTo(totalPowerDrawKw / 3600),
    storedEnergyKwh: roundTo(rows.reduce((sum, row) => sum + row.storedEnergyKwh, 0)),
    batteryCapacityKwh: roundTo(rows.reduce((sum, row) => sum + row.batteryCapacityKwh, 0)),
  };
}

export function formatModuleStatusTable(rows: ModuleStatusRow[], summary: ModuleStatusSummary): string {
  const moduleWidth = Math.max("MODULE".length, ...rows.map((row) => row.moduleName.length));
  const declaredWidth = Math.max("STATE".length, ...rows.map((row) => row.declaredState.length));
  const effectiveWidth = Math.max("EFFECTIVE".length, ...rows.map((row) => row.effectiveState.length));
  const powerValues = rows.map((row) => formatNumber(row.powerDrawKw));
  const powerWidth = Math.max("POWER DRAW (kW)".length, ...powerValues.map((value) => value.length));

  const lines = [
    `${pad("MODULE", moduleWidth)}  ${pad("STATE", declaredWidth)}  ${pad("EFFECTIVE", effectiveWidth)}  ${pad("POWER DRAW (kW)", powerWidth)}`,
    `${"-".repeat(moduleWidth)}  ${"-".repeat(declaredWidth)}  ${"-".repeat(effectiveWidth)}  ${"-".repeat(powerWidth)}`,
  ];

  rows.forEach((row, index) => {
    lines.push(
      `${pad(row.moduleName, moduleWidth)}  ${pad(row.declaredState, declaredWidth)}  ${pad(row.effectiveState, effectiveWidth)}  ${pad(formatNumber(row.powerDrawKw), powerWidth)}`,
    );
  });

  lines.push(`totalPowerDrawKw=${formatNumber(summary.totalPowerDrawKw)}`);
  lines.push(`tickEnergyKwh=${formatNumber(summary.tickEnergyKwh)}`);
  lines.push(`batteryCharge=${formatNumber(summary.storedEnergyKwh)} / ${formatNumber(summary.batteryCapacityKwh)} kWh`);
  lines.push(`powerAvailability=${summary.storedEnergyKwh > 0 ? "available" : "unavailable"}`);
  if (summary.batteryCapacityKwh > 0 && summary.storedEnergyKwh <= 0) {
    lines.push("powerExplanation=No usable battery energy is available; powered work cannot advance.");
  }
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
