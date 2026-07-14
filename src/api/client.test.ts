import { describe, expect, test } from "bun:test";
import { apiBaseUrl, apiRequest } from "./client";

describe("Habitat API client", () => {
  test("uses the default API base URL and sends JSON", async () => {
    const requests: Request[] = [];

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
