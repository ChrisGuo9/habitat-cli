import { describe, expect, test } from "bun:test";
import { apiBaseUrl, apiRequest, scanWorldViaApi } from "./client";
import type { WorldScanResponse } from "../kepler";

describe("Habitat API client", () => {
  test("scanWorldViaApi sends scan inputs without a habitat id", async () => {
    const requests: Request[] = [];
    const response: WorldScanResponse = { scan: { modelVersion: "resource-probability-v2", origin: { x: 3, y: -2 }, sensorStrength: 60, radiusTiles: 1, tiles: [] } };
    const testFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return Response.json(response);
    }) as typeof fetch;

    await expect(scanWorldViaApi({ x: 3, y: -2, sensorStrength: 60, radiusTiles: 1 }, testFetch)).resolves.toEqual(response);
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/world/scan");
    expect(Object.fromEntries(url.searchParams)).toEqual({ x: "3", y: "-2", sensorStrength: "60", radiusTiles: "1" });
    expect(url.searchParams.has("habitatId")).toBe(false);
  });

  test("uses the default API base URL and sends JSON", async () => {
    const requests: Request[] = [];
    const previousBaseUrl = process.env.HABITAT_API_BASE_URL;
    delete process.env.HABITAT_API_BASE_URL;

    const testFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return new Response(JSON.stringify({ registration: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      expect(apiBaseUrl({})).toBe("http://localhost:8787");
      await expect(apiRequest<{ registration: null }>("/registration", {}, testFetch)).resolves.toEqual({ registration: null });
      expect(requests[0]?.url).toBe("http://localhost:8787/registration");
      expect(requests[0]?.headers.get("Content-Type")).toBe("application/json");
    } finally {
      if (previousBaseUrl === undefined) delete process.env.HABITAT_API_BASE_URL;
      else process.env.HABITAT_API_BASE_URL = previousBaseUrl;
    }
  });

  test("reports the method and path for non-success responses", async () => {
    const testFetch = (async () => new Response(JSON.stringify({ error: "Registration failed." }), { status: 502 })) as unknown as typeof fetch;

    try {
      await expect(apiRequest("/registration", { method: "POST" }, testFetch)).rejects.toThrow(
        "POST /registration failed (502): Registration failed.",
      );
    } finally {
    }
  });

  test("turns connection failures into a beginner-friendly error", async () => {
    const testFetch = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;

    try {
      await expect(apiRequest("/registration", {}, testFetch)).rejects.toThrow(
        "GET /registration could not connect to the Habitat API. Start it with `bun run server`.",
      );
    } finally {
    }
  });
});
