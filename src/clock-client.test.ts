import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKeplerClockController, type ClockSocket } from "./clock-client";
import { createTickService } from "./tick-service";
import { defaultClockState, readClockState, readSimulationState, writeClockState, writeModuleState, writeRegistration } from "./state";

class FakeSocket implements ClockSocket {
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  send(value: string) { this.sent.push(value); }
  close() { this.closed = true; this.emit("close"); }
  emit(type: string, data?: unknown) { for (const listener of this.listeners.get(type) ?? []) listener({ data }); }
}

function setup() {
  const cwd = mkdtempSync(join(tmpdir(), "habitat-clock-"));
  writeRegistration({
    habitatId: "habitat-123", habitatUuid: "11111111-1111-4111-8111-111111111111", displayName: "Artemis Ridge",
    baseUrl: "https://planet.turingguild.com", tokenSource: "test", streamUrl: "wss://planet.turingguild.com/planet/stream",
    apiToken: "stream-secret", stream: { protocolVersion: "1.0", subscriptions: ["ticks"], currentTick: 800, tickIntervalMs: 5000, ticksPerPulse: 1, status: "running" },
  }, cwd);
  writeModuleState({ modules: [], blueprints: [] }, cwd);
  const sockets: FakeSocket[] = [];
  const service = createTickService({ cwd, getSolar: async () => ({ solarIrradiance: { wPerM2: 0, condition: "dark" } }) });
  const controller = createKeplerClockController({ cwd, tickService: service, socketFactory: (url) => { expect(url).toBe("wss://planet.turingguild.com/planet/stream"); const socket = new FakeSocket(); sockets.push(socket); return socket; }, reconnectDelayMs: 1 });
  return { cwd, sockets, service, controller };
}

describe("Kepler clock controller", () => {
  test("authenticates with hello, waits for acknowledgement, and applies full advances", async () => {
    const { cwd, sockets, service, controller } = setup();
    const events: unknown[] = [];
    try {
      controller.subscribe((event) => events.push(event));
      await controller.listenOn();
      const socket = sockets[0]!;
      expect(readClockState(cwd).mode).toBe("kepler");
      socket.emit("open");
      expect(JSON.parse(socket.sent[0]!)).toEqual({ type: "hello", apiToken: "stream-secret", subscribe: ["ticks"] });
      expect(socket.sent[0]).not.toContain("lastAppliedPlanetTick");

      socket.emit("message", JSON.stringify({ type: "planet_tick", tick: 900, previousTick: 800, advancedBy: 100, secondsPerTick: 5, issuedAt: "2026-07-17T14:30:00.000Z" }));
      await controller.idle();
      expect(readSimulationState(cwd)).toBeNull();

      socket.emit("message", JSON.stringify({ type: "hello_ack", connectionId: "connection-1", habitatId: "habitat-123", subscriptions: ["ticks"], currentTick: 800, catchUpTicks: 0, tickIntervalMs: 5000, ticksPerPulse: 1, clockStatus: "running", serverTime: "2026-07-17T14:29:59.000Z" }));
      socket.emit("message", JSON.stringify({ type: "planet_tick", tick: 900, previousTick: 800, advancedBy: 100, secondsPerTick: 5, issuedAt: "2026-07-17T14:30:00.000Z" }));
      await controller.idle();

      expect(readSimulationState(cwd)?.currentTick).toBe(100);
      expect(readClockState(cwd)).toMatchObject({ connectionState: "connected", lastKeplerTick: 900, lastAdvancedBy: 100 });
      expect(events).toEqual([{ tick: 900, previousTick: 800, advancedBy: 100, issuedAt: "2026-07-17T14:30:00.000Z", applied: true }]);
      await service.idle();
    } finally { await controller.shutdown(); rmSync(cwd, { recursive: true, force: true }); }
  });

  test("rejects a mismatched hello acknowledgement without leaking the token", async () => {
    const { cwd, sockets, controller } = setup();
    try {
      await controller.listenOn();
      sockets[0]!.emit("open");
      sockets[0]!.emit("message", JSON.stringify({ type: "hello_ack", connectionId: "connection-1", habitatId: "wrong-habitat", subscriptions: ["ticks"], currentTick: 800, catchUpTicks: 0, tickIntervalMs: 5000, ticksPerPulse: 1, clockStatus: "running", serverTime: "2026-07-17T14:29:59.000Z" }));
      await controller.idle();
      expect(readClockState(cwd).connectionState).toBe("error");
      expect(readClockState(cwd).lastConnectionError).toContain("Habitat identity");
      expect(readClockState(cwd).lastConnectionError).not.toContain("stream-secret");
    } finally { await controller.shutdown(); rmSync(cwd, { recursive: true, force: true }); }
  });

  test("reconnects after an unexpected close and stops cleanly in manual mode", async () => {
    const { cwd, sockets, controller } = setup();
    try {
      await controller.listenOn();
      sockets[0]!.emit("close");
      await Bun.sleep(5);
      expect(sockets).toHaveLength(2);
      await controller.listenOff();
      expect(readClockState(cwd)).toMatchObject({ mode: "manual", connectionState: "disconnected" });
      expect(sockets[1]!.closed).toBe(true);
      await Bun.sleep(5);
      expect(sockets).toHaveLength(2);
    } finally { await controller.shutdown(); rmSync(cwd, { recursive: true, force: true }); }
  });
});
