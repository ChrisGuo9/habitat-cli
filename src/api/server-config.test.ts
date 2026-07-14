import { describe, expect, test } from "bun:test";
import { readServerConfig } from "./server-config";

describe("Habitat API server configuration", () => {
  test("uses remote-access defaults", () => {
    expect(readServerConfig({})).toEqual({
      host: "0.0.0.0",
      port: 8787,
    });
  });

  test("honors explicit host and port overrides", () => {
    expect(
      readServerConfig({
        HABITAT_API_HOST: "0.0.0.0",
        HABITAT_API_PORT: "9999",
      }),
    ).toEqual({
      host: "0.0.0.0",
      port: 9999,
    });
  });
});
