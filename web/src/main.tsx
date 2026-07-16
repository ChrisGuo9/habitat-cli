import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { createApiClient, validateTickCount, type ApiState, type Module, type TickResponse } from "./api";

const api = createApiClient(import.meta.env.VITE_HABITAT_API_BASE_URL ?? "http://127.0.0.1:8787");
const attr = (module: Module, key: string) => module.runtimeAttributes[key];
const numberAttr = (module: Module, key: string) => {
  const value = attr(module, key);
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const status = String(attr(module, "status") ?? "offline");
    const selected = (value as Record<string, unknown>)[status];
    return typeof selected === "number" ? selected : null;
  }
  return null;
};
const fmt = (value: number | null, unit = "") => value === null ? "—" : `${value.toFixed(2)}${unit}`;

function App() {
  const [state, setState] = useState<ApiState | null>(null);
  const [lastTick, setLastTick] = useState<TickResponse["summary"] | null>(null);
  const [solar, setSolar] = useState<TickResponse["solarIrradiance"] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [customTicks, setCustomTicks] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const modules = state?.modules?.modules ?? [];
  const tick = state?.simulation?.currentTick ?? 0;
  const load = async () => { setError(""); try { setState(await api.getState()); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load Habitat state."); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(""); try { await action(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Habitat API request failed."); } finally { setBusy(false); } };
  const register = () => { if (name.trim()) void run(async () => { await api.register(name.trim()); setName(""); setLastTick(null); setSolar(null); }); };
  const unregister = () => { if (window.confirm("Unregister this Habitat? This clears its local registration, modules, and simulation state.")) void run(async () => { await api.unregister(); setLastTick(null); setSolar(null); }); };
  const advance = (count: number) => void run(async () => { const result = await api.runTicks(count); setLastTick(result.summary); setSolar(result.solarIrradiance); });
  const custom = () => { const count = validateTickCount(customTicks); if (!count) { setError("Enter a positive whole-number tick count."); return; } advance(count); };
  const registered = Boolean(state?.registration);
  return <main className="dashboard">
    <header className="topbar"><div><p className="eyebrow">KEPLER 442b / HABITAT CONTROL</p><h1>{state?.registration?.displayName ?? "Habitat Dashboard"}</h1><p className="muted">Simulation tick {tick.toLocaleString()}</p></div><button className="theme-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle light and dark mode">{theme === "dark" ? "☀ Light" : "◐ Dark"}</button></header>
    {error && <div className="alert" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {!state ? <section className="card loading">Loading Habitat state…</section> : <div className="grid">
      <section className="card registration"><SectionTitle eyebrow="MISSION STATE" title="Habitat registration" />{registered ? <><p className="status online">● Registered</p><p className="muted">{state.registration?.habitatId}</p><button className="danger" disabled={busy} onClick={unregister}>Unregister Habitat</button></> : <><p className="muted">No Habitat is registered with the API.</p><label>Habitat name<input value={name} onChange={e => setName(e.target.value)} placeholder="Kepler Ridge" /></label><button disabled={busy || !name.trim()} onClick={register}>Register Habitat</button></>}</section>
      <section className="card power"><SectionTitle eyebrow="ENERGY SYSTEMS" title="Power & solar" /><p className="muted metric-note">Values below come from the most recent simulation tick.</p><div className="metrics"><Metric label="Generation" value={lastTick ? fmt(lastTick.generatedKwh, " kWh") : "Awaiting tick"} /><Metric label="Consumption" value={lastTick ? fmt(lastTick.consumedKwh, " kWh") : "Awaiting tick"} /><Metric label="Net power" value={lastTick ? fmt(lastTick.generatedKwh - lastTick.consumedKwh, " kWh") : "Awaiting tick"} /><Metric label="Battery state" value={lastTick ? fmt(lastTick.storedEnergyKwh, " kWh") : "Awaiting tick"} /><Metric label="Irradiance" value={solar ? fmt(solar.wPerM2, " W/m²") : "Awaiting tick"} /><Metric label="Condition" value={solar?.condition ?? "Awaiting tick"} /></div></section>
      <section className="card ticks"><SectionTitle eyebrow="TIME CONTROL" title="Advance simulation" /><div className="tick-buttons">{[[1,"1 tick"],[60,"1 minute"],[600,"10 minutes"],[3600,"1 hour"]].map(([count,label]) => <button key={count} disabled={!registered || busy} onClick={() => advance(Number(count))}>{label}</button>)}</div><div className="custom-row"><input aria-label="Custom tick count" value={customTicks} onChange={e => setCustomTicks(e.target.value)} inputMode="numeric" placeholder="Custom ticks" /><button disabled={!registered || busy} onClick={custom}>Advance</button></div></section>
      <section className="card modules"><SectionTitle eyebrow="HABITAT SYSTEMS" title="Current modules" />{modules.length === 0 ? <p className="muted">No modules are available.</p> : <div className="module-list">{modules.map(module => { const status = String(attr(module,"status") ?? "idle"); const power = numberAttr(module,"powerDrawKw"); const battery = numberAttr(module,"currentEnergyKwh"); return <article className="module" key={module.id}><div><h3>{module.displayName}</h3><p className="muted">{module.blueprintId}</p></div><div className="module-data"><span className={`status ${status === "offline" ? "offline" : "online"}`}>{status}</span><span>{fmt(power," kW")}</span>{battery !== null && <span>{fmt(battery," kWh")}</span>}<button disabled={busy} onClick={() => void run(() => api.updateModuleStatus(module.id, status === "offline" ? "online" : "offline"))}>{status === "offline" ? "Bring online" : "Take offline"}</button></div></article>; })}</div>}</section>
    </div>}
  </main>;
}
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span className="muted">{label}</span><strong>{value}</strong></div>; }
createRoot(document.getElementById("root")!).render(<App />);
