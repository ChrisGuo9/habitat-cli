import { randomUUID } from "node:crypto";
import type { HabitatAlert, HabitatAlertSubject } from "./state";
import { readAlertState, writeAlertState } from "./state";

export type AlertObservation = { condition: string; severity: string; source: string; subject?: HabitatAlertSubject };
const sameSubject = (a?: HabitatAlertSubject, b?: HabitatAlertSubject) => a?.type === b?.type && a?.id === b?.id;

export function observeAlert(input: AlertObservation, cwd = process.cwd(), now = new Date().toISOString()): HabitatAlert {
  const state = readAlertState(cwd) ?? { alerts: [] };
  const existing = state.alerts.find((alert) => alert.condition === input.condition && alert.source === input.source && alert.status !== "resolved" && sameSubject(alert.subject, input.subject));
  const alert: HabitatAlert = existing
    ? { ...existing, lastObservedAt: now, occurrenceCount: existing.occurrenceCount + 1 }
    : { id: `alert_${randomUUID()}`, ...input, status: "open", firstObservedAt: now, lastObservedAt: now, occurrenceCount: 1 };
  writeAlertState({ alerts: existing ? state.alerts.map((item) => item.id === alert.id ? alert : item) : [...state.alerts, alert] }, cwd);
  return alert;
}

export function acknowledgeAlert(id: string, cwd = process.cwd(), now = new Date().toISOString()): HabitatAlert {
  const state = readAlertState(cwd) ?? { alerts: [] };
  const existing = state.alerts.find((alert) => alert.id === id);
  if (!existing) throw new Error(`Alert not found: ${id}`);
  if (existing.status === "resolved") throw new Error(`Alert is already resolved: ${id}`);
  const updated = { ...existing, status: "acknowledged" as const, acknowledgedAt: now };
  writeAlertState({ alerts: state.alerts.map((alert) => alert.id === id ? updated : alert) }, cwd);
  return updated;
}

export function resolveAlert(condition: string, subject: HabitatAlertSubject | undefined, cwd = process.cwd(), now = new Date().toISOString()): HabitatAlert | null {
  const state = readAlertState(cwd) ?? { alerts: [] };
  const existing = state.alerts.find((alert) => alert.condition === condition && alert.status !== "resolved" && sameSubject(alert.subject, subject));
  if (!existing) return null;
  const updated = { ...existing, status: "resolved" as const, resolvedAt: now, lastObservedAt: now };
  writeAlertState({ alerts: state.alerts.map((alert) => alert.id === existing.id ? updated : alert) }, cwd);
  return updated;
}
