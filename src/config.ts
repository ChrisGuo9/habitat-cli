import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type KeplerConfig = {
  baseUrl: string;
  token: string;
  tokenSource: string;
};

const ENV_PATHS = [".env/.env", ".env"];

function parseEnv(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

export function loadKeplerConfig(cwd = process.cwd()): KeplerConfig {
  const fileConfig: Record<string, string> = {};

  for (const relativePath of ENV_PATHS) {
    const fullPath = resolve(cwd, relativePath);
    if (!existsSync(fullPath) || !statSync(fullPath).isFile()) continue;
    Object.assign(fileConfig, parseEnv(readFileSync(fullPath, "utf8")));
  }

  const baseUrl = process.env.KEPLER_BASE_URL ?? fileConfig.KEPLER_BASE_URL;
  const token = process.env.KEPLER_PLANET_TOKEN ?? fileConfig.KEPLER_PLANET_TOKEN;
  const tokenSource = process.env.KEPLER_PLANET_TOKEN ? "KEPLER_PLANET_TOKEN" : "file:.env";

  if (!baseUrl) {
    throw new Error("Missing KEPLER_BASE_URL in .env.");
  }

  if (!token) {
    throw new Error("Missing KEPLER_PLANET_TOKEN in .env.");
  }

  return { baseUrl, token, tokenSource };
}
