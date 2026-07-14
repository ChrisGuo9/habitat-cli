export type ServerConfig = {
  host: string;
  port: number;
};

export function readServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    host: env.HABITAT_API_HOST ?? "127.0.0.1",
    port: Number(env.HABITAT_API_PORT ?? "8787"),
  };
}
