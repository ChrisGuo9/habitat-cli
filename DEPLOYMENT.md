#  Habitat  Notes

## Deployed Commit

- Commit hash: `a3f1a6b`
-  The server checkout matched the public repository's `main` branch. Locked dependencies were installed with `bun install --frozen-lockfile`, and the linked `habitat` command displayed the expected CLI help.

## Local API Check On The OpenClaw Server

- Command run: `curl http://127.0.0.1:8787/registration`
- Result: The API returned the existing `Amphoreous` Habitat registration rather than `null`.
-  `ss -ltn` showed the Bun backend listening on `0.0.0.0:8787`. The server-side `habitat status` command reported the same registration and six modules.

## Laptop CLI Over Tailscale

- Command run: `habitat status`
- Result: The laptop CLI reached the OpenClaw backend through the private Tailscale connection and reported `Amphoreous` with six modules.
- The laptop's ignored `.env` supplied `HABITAT_API_BASE_URL`, so the CLI used the remote REST API instead of the laptop SQLite file.

## Server Request Logs

- Observed log lines: `[kepler] GET /habitats/.../registration -> 200`, `[habitat-api] GET /habitat/status -> 200`, and `[habitat-api] GET /state -> 200`.
- A second `habitat status` command on the laptop produced another matching set of request logs in the manual server terminal.

## Manual Server Shutdown Check

- What happened after `Ctrl+C`: The SSH-owned Bun process stopped, Linux no longer showed a listener on port `8787`, and the laptop CLI exited with a connection error.
- The repository, `.env`, and SQLite database remained on the server, but no process was available to answer REST requests.

## Why `0.0.0.0` Matters

-  Binding to `0.0.0.0` makes the backend listen on the server's network interfaces, including its private Tailscale interface. Binding only to `127.0.0.1` would restrict access to programs running inside the server.

## Why `.env` And `habitat.sqlite` Stay Ignored

- `.env` contains environment configuration and credentials, while `habitat.sqlite` contains local Habitat state. Both files must remain beside the deployed code at runtime, but Git ignores them so secrets and mutable state are not published or overwritten by code updates. Both were secured with mode `600` on the server.
