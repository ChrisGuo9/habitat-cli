import { describe, expect, test } from "bun:test";
import { createApiClient, validateTickCount, type ApiState } from "./api";

describe("dashboard API client", () => {
  test("uses the local REST backend by default", () => {
    const calls: string[] = [];
    const client = createApiClient(undefined, async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ registration: null, modules: null, inventory: null, construction: null, simulation: null }), { status: 200 });
    });

    return client.getState().then(() => {
      expect(calls[0]).toBe("http://127.0.0.1:8787/state");
    });
  });

  test("validates only positive whole-number tick counts", () => {
    expect(validateTickCount("1")).toBe(1);
    expect(validateTickCount("3600")).toBe(3600);
    expect(validateTickCount("0")).toBeNull();
    expect(validateTickCount("1.5")).toBeNull();
    expect(validateTickCount("abc")).toBeNull();
  });

  test("sends module status updates through the existing PATCH route", async () => {
    const requests: Request[] = [];
    const client = createApiClient("http://habitat.test", async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(JSON.stringify({ id: "module-1" }), { status: 200 });
    });

    await client.updateModuleStatus("module-1", "offline");

    expect(requests[0]?.url).toBe("http://habitat.test/modules/module-1");
    expect(requests[0]?.method).toBe("PATCH");
    expect(await requests[0]?.json()).toEqual({ runtimeAttributes: { status: "offline" } });
  });

  test("reports API error messages", async () => {
    const client = createApiClient("http://habitat.test", async () =>
      new Response(JSON.stringify({ error: "API unavailable" }), { status: 502 }),
    );

    await expect(client.getState()).rejects.toThrow("API unavailable");
  });
});

export const emptyApiState: ApiState = {
  registration: null,
  modules: null,
  inventory: null,
  construction: null,
  simulation: null,
};
