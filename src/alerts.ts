import { randomUUID } from "node:crypto";
import type { HabitatAlert, HabitatAlertSubject } from "./state";
import { readAlertState, writeAlertState } from "./state";

export type AlertObservation = { condition: string; severity: string; source: string; subject?: HabitatAlertSubject };
const sameSubject = (a?: HabitatAlertSubject, b?: HabitatAlertSubject) => a?.type === b?.type && a?.id === b?.id;
const copy: Record<string, { title: string; description: string }> = {
  "human-outside": { title: "Human deployed outside habitat", description: "A crew member is outside the habitat on an active EVA." },
  "carrying-capacity": { title: "EVA carrying capacity reached", description: "The deployed crew member cannot carry additional material." },
  "collection-failure": { title: "Resource collection failed", description: "Kepler rejected a collection request after local validation succeeded." },
};

export function observeAlert(input: AlertObservation, cwd = process.cwd(), now = new Date().toISOString()): HabitatAlert {
  const state = readAlertState(cwd) ?? { alerts: [] };
  const existing = state.alerts.find((alert) => alert.code === input.condition && alert.source === input.source && alert.status !== "resolved" && sameSubject(alert.subject, input.subject));
  const message = copy[input.condition] ?? { title: input.condition, description: input.condition };
  const alert: HabitatAlert = existing
    ? { ...existing, lastObservedAt: now, occurrenceCount: existing.occurrenceCount + 1 }
    : { id: `alert_${randomUUID()}`, code: input.condition, title: message.title, description: message.description, severity: input.severity, source: input.source, ...(input.subject ? { subject: input.subject } : {}), status: "open", openedAt: now, lastObservedAt: now, occurrenceCount: 1 };
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
  const existing = state.alerts.find((alert) => alert.code === condition && alert.status !== "resolved" && sameSubject(alert.subject, subject));
  if (!existing) return null;
  const updated = { ...existing, status: "resolved" as const, resolvedAt: now, lastObservedAt: now };
  writeAlertState({ alerts: state.alerts.map((alert) => alert.id === existing.id ? updated : alert) }, cwd);
  return updated;
}
