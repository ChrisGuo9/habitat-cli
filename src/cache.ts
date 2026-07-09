import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type CacheItem = {
  type: string;
  quantity: number;
};

export type SupplyCache = {
  id: string;
  name: string;
  location: string;
  items: CacheItem[];
  quantity: number;
  capacity: number;
};

type CacheState = {
  caches: SupplyCache[];
};

const CACHES_PATH = ".habitat/caches.json";

function cachesPath(cwd = process.cwd()): string {
  return resolve(cwd, CACHES_PATH);
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readState(cwd = process.cwd()): CacheState {
  return readJson<CacheState>(cachesPath(cwd)) ?? { caches: [] };
}

function writeState(state: CacheState, cwd = process.cwd()): void {
  writeJson(cachesPath(cwd), state);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextCacheId(caches: SupplyCache[]): string {
  let highest = 0;
  for (const cache of caches) {
    const match = /^c(\d+)$/.exec(cache.id);
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `c${highest + 1}`;
}

function findCacheIndex(state: CacheState, id: string): number {
  return state.caches.findIndex((cache) => cache.id === id || cache.name === id || slugify(cache.name) === id);
}

export function listCaches(cwd = process.cwd()): SupplyCache[] {
  return readState(cwd).caches;
}

export function getCache(id: string, cwd = process.cwd()): SupplyCache | null {
  return readState(cwd).caches.find((cache) => cache.id === id || cache.name === id || slugify(cache.name) === id) ?? null;
}

export function createCache(name: string, type: string, cwd = process.cwd()): SupplyCache {
  const state = readState(cwd);
  const cache: SupplyCache = {
    id: nextCacheId(state.caches),
    name,
    location: type,
    items: [],
    quantity: 0,
    capacity: 100,
  };
  writeState({ caches: [...state.caches, cache] }, cwd);
  return cache;
}

export function addCacheItem(id: string, itemType: string, cwd = process.cwd()): SupplyCache | null {
  const state = readState(cwd);
  const index = findCacheIndex(state, id);
  if (index < 0) return null;
  const cache = state.caches[index];
  const items = [...cache.items];
  const existing = items.find((item) => item.type === itemType);
  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({ type: itemType, quantity: 1 });
  }
  const updated = {
    ...cache,
    items,
    quantity: cache.quantity + 1,
  };
  const caches = [...state.caches];
  caches[index] = updated;
  writeState({ caches }, cwd);
  return updated;
}

export function consumeCacheItem(id: string, itemType: string, cwd = process.cwd()): SupplyCache | null {
  const state = readState(cwd);
  const index = findCacheIndex(state, id);
  if (index < 0) return null;
  const cache = state.caches[index];
  const itemIndex = cache.items.findIndex((item) => item.type === itemType);
  if (itemIndex < 0 || cache.quantity <= 0) return null;
  const items = [...cache.items];
  const item = { ...items[itemIndex] };
  item.quantity -= 1;
  if (item.quantity <= 0) {
    items.splice(itemIndex, 1);
  } else {
    items[itemIndex] = item;
  }
  const updated = {
    ...cache,
    items,
    quantity: cache.quantity - 1,
  };
  const caches = [...state.caches];
  caches[index] = updated;
  writeState({ caches }, cwd);
  return updated;
}

export function deleteCache(id: string, cwd = process.cwd()): boolean {
  const state = readState(cwd);
  const caches = state.caches.filter((cache) => cache.id !== id && cache.name !== id && slugify(cache.name) !== id);
  if (caches.length === state.caches.length) return false;
  if (caches.length === 0) {
    const filePath = cachesPath(cwd);
    if (existsSync(filePath)) unlinkSync(filePath);
    return true;
  }
  writeState({ caches }, cwd);
  return true;
}
