import { readClockState, readRegistration, writeClockState } from "./state";
import type { TickService } from "./tick-service";

export type ClockSocket = {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  send(value: string): void;
  close(): void;
};

export type ClockTickEvent = {
  tick: number;
  previousTick: number;
  advancedBy: number;
  issuedAt: string;
  applied: boolean;
};

type ControllerDependencies = {
  cwd?: string;
  tickService: TickService;
  socketFactory?: (url: string) => ClockSocket;
  reconnectDelayMs?: number;
  now?: () => string;
};

type HelloAck = {
  type: "hello_ack";
  habitatId: string;
  subscriptions: string[];
};

type PlanetTick = {
  type: "planet_tick";
  tick: number;
  previousTick: number;
  advancedBy: number;
  issuedAt: string;
};

export function createKeplerClockController(dependencies: ControllerDependencies) {
  const cwd = dependencies.cwd ?? process.cwd();
  const socketFactory = dependencies.socketFactory ?? ((url) => new WebSocket(url) as unknown as ClockSocket);
  const reconnectDelayMs = dependencies.reconnectDelayMs ?? 2000;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const listeners = new Set<(event: ClockTickEvent) => void>();
  let socket: ClockSocket | null = null;
  let authenticated = false;
  let stopping = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let messageQueue: Promise<void> = Promise.resolve();

  function updateClock(updates: Partial<ReturnType<typeof readClockState>>): void {
    writeClockState({ ...readClockState(cwd), ...updates }, cwd);
  }

  function recordError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    updateClock({ connectionState: "error", lastConnectionError: message });
  }

  function scheduleReconnect(): void {
    if (stopping || readClockState(cwd).mode !== "kepler" || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch(recordError);
    }, reconnectDelayMs);
  }

  async function handleMessage(data: unknown): Promise<void> {
    if (typeof data !== "string") throw new Error("Kepler stream sent a non-text message.");
    let value: unknown;
    try { value = JSON.parse(data); } catch { throw new Error("Kepler stream sent invalid JSON."); }
    if (!value || typeof value !== "object" || !("type" in value)) throw new Error("Kepler stream message is missing type.");

    if ((value as { type?: unknown }).type === "hello_ack") {
      const acknowledgement = value as HelloAck;
      const registration = readRegistration(cwd);
      if (!registration || acknowledgement.habitatId !== registration.habitatId) {
        throw new Error("Kepler hello acknowledgement Habitat identity does not match the saved registration.");
      }
      if (!Array.isArray(acknowledgement.subscriptions) || !acknowledgement.subscriptions.includes("ticks")) {
        throw new Error("Kepler hello acknowledgement did not confirm the ticks subscription.");
      }
      authenticated = true;
      updateClock({ connectionState: "connected", lastConnectedAt: now(), lastConnectionError: null });
      return;
    }

    if ((value as { type?: unknown }).type !== "planet_tick" || !authenticated || readClockState(cwd).mode !== "kepler") return;
    const tick = value as PlanetTick;
    if (!Number.isSafeInteger(tick.tick) || tick.tick < 0 || !Number.isSafeInteger(tick.previousTick) || tick.previousTick < 0) {
      throw new Error("Kepler planet_tick contains an invalid absolute tick.");
    }
    if (!Number.isSafeInteger(tick.advancedBy) || tick.advancedBy < 1) {
      throw new Error("Kepler planet_tick advancedBy must be a positive whole number.");
    }
    if (typeof tick.issuedAt !== "string" || Number.isNaN(Date.parse(tick.issuedAt))) {
      throw new Error("Kepler planet_tick issuedAt must be an ISO timestamp.");
    }
    const outcome = await dependencies.tickService.runKepler(tick);
    const event = { tick: tick.tick, previousTick: tick.previousTick, advancedBy: tick.advancedBy, issuedAt: tick.issuedAt, applied: outcome.applied };
    for (const listener of listeners) listener(event);
  }

  async function connect(): Promise<void> {
    if (stopping || readClockState(cwd).mode !== "kepler" || socket) return;
    const registration = readRegistration(cwd);
    if (!registration?.streamUrl || !registration.apiToken || !registration.stream) {
      throw new Error('No Kepler stream credentials are saved. Repeat `habitat register --name "<habitat name>"` with the same Habitat identity.');
    }
    updateClock({ connectionState: "connecting", lastConnectionError: null });
    const current = socketFactory(registration.streamUrl);
    socket = current;
    current.addEventListener("open", () => {
      if (socket !== current || stopping) return;
      const subscribe = registration.stream!.subscriptions.filter((value) => value === "ticks");
      current.send(JSON.stringify({ type: "hello", apiToken: registration.apiToken, subscribe }));
    });
    current.addEventListener("message", (event) => {
      messageQueue = messageQueue.then(() => handleMessage(event.data)).catch((error) => { recordError(error); });
    });
    current.addEventListener("error", () => { recordError(new Error("Kepler WebSocket connection error.")); });
    current.addEventListener("close", () => {
      if (socket !== current) return;
      socket = null;
      authenticated = false;
      if (!stopping && readClockState(cwd).mode === "kepler") {
        updateClock({ connectionState: "disconnected" });
        scheduleReconnect();
      }
    });
  }

  async function stopConnection(): Promise<void> {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    const current = socket;
    socket = null;
    authenticated = false;
    current?.close();
    await messageQueue;
    await dependencies.tickService.idle();
  }

  return {
    async start(): Promise<void> {
      stopping = false;
      if (readClockState(cwd).mode === "kepler") await connect();
    },
    async listenOn(): Promise<void> {
      stopping = false;
      updateClock({ mode: "kepler", connectionState: "disconnected", lastConnectionError: null });
      await connect();
    },
    async listenOff(): Promise<void> {
      stopping = true;
      await stopConnection();
      updateClock({ mode: "manual", connectionState: "disconnected", lastConnectionError: null });
      stopping = false;
    },
    status() { return readClockState(cwd); },
    subscribe(listener: (event: ClockTickEvent) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); },
    async idle(): Promise<void> { await messageQueue; await dependencies.tickService.idle(); },
    async shutdown(): Promise<void> {
      stopping = true;
      await stopConnection();
      updateClock({ connectionState: "disconnected" });
    },
  };
}

export type KeplerClockController = ReturnType<typeof createKeplerClockController>;
