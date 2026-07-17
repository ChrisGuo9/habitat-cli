# Manual Habitat Deployment Video Script

This script demonstrates the completed manual OpenClaw deployment lab. Keep private IP addresses, tokens, device codes, and database contents out of the recording.

## 1. Introduce the lab

**Say:**

“Hi, my name is Chris. In this lab, I manually deployed my existing Habitat project to my personal OpenClaw server. I deployed the code from GitHub, copied the ignored environment configuration and SQLite state, ran the backend manually, and verified private remote access through Tailscale.”

## 2. Show the existing MacBook project

Run on the MacBook:

```bash
cd ~/Documents/labs/habitat-cli
pwd
git remote get-url origin
git show --no-patch --oneline a3f1a6b
git show --no-patch --oneline 1b024c1
```

**Say:**

“This is the existing Habitat project in my course labs folder. I did not create a separate deployment repository. Commit `a3f1a6b` prepared the backend for deployment, and commit `1b024c1` recorded the deployment evidence. The remote URL is the public GitHub repository I will submit.”

Do not claim that the current working tree is clean. Later work may exist after the deployment commits.

## 3. Explain remote binding

Run:

```bash
sed -n '1,30p' src/api/server-config.ts
```

**Say:**

“The backend uses port `8787` by default and binds to `0.0.0.0`. This allows it to accept requests through the server’s network interfaces, including its private Tailscale interface. Binding only to `127.0.0.1` would restrict access to programs running inside the server.”

## 4. Show that deployment files are protected locally

Run:

```bash
ls -lh .env habitat.sqlite
git check-ignore -v .env habitat.sqlite
```

**Say:**

“The `.env` file contains configuration and credentials, while `habitat.sqlite` contains persistent Habitat state. The application needs both files at runtime, but Git ignores them so they are not published.”

Do not open `.env` or display the database.

## 5. Explain the completed file transfer

**Say:**

“Before starting the remote backend, I stopped the laptop backend and copied both deployment files to the OpenClaw checkout with `scp`. I transferred them through the private Tailscale connection, not through a public application endpoint.”

You do not need to repeat the copy during the video. The command previously used was:

```bash
scp .env habitat.sqlite chris@chris-server-j2algy6b:habitat-cli/
```

## 6. Open Terminal 1 and inspect OpenClaw

Run:

```bash
ssh chris@chris-server-j2algy6b
cd ~/habitat-cli
pwd
git rev-parse --short HEAD
git show --no-patch --oneline a3f1a6b
habitat --help
```

**Say:**

“This is the cloned Habitat checkout on OpenClaw. The checkout contains the deployment commit, locked dependencies were installed with `bun install --frozen-lockfile`, and `bun link` made the Habitat CLI available to my Linux user.”

## 7. Verify private files on OpenClaw

Run in Terminal 1:

```bash
stat -c '%a %n' .env habitat.sqlite
git check-ignore -v .env habitat.sqlite
git status --short
```

**Say:**

“Both private files have permission mode `600`, so only my Linux user can read and write them. Git ignores both files, so they remain in the checkout without becoming repository changes.”

## 8. Start the manual backend

Run in Terminal 1:

```bash
bun run server
```

**Say:**

“The Habitat backend is now running manually on `0.0.0.0:8787`. This process belongs to this SSH terminal, so closing the terminal or pressing Control-C will stop it.”

Leave Terminal 1 open.

## 9. Open Terminal 2 and verify inside OpenClaw

Open another MacBook terminal and run:

```bash
ssh chris@chris-server-j2algy6b
cd ~/habitat-cli
ss -ltn | grep ':8787'
```

**Say:**

“Linux reports a listener on `0.0.0.0:8787`, confirming that the backend is available through the server’s network interfaces.”

Run this sanitized API check:

```bash
curl -s http://127.0.0.1:8787/registration |
bun -e 'const v=await Bun.stdin.json(); console.log({registered:Boolean(v.registration),displayName:v.registration?.displayName})'
```

Then run:

```bash
habitat status
```

**Say:**

“The server-local API loaded the existing registration rather than returning `null`. The server CLI reports the same Habitat display name and six modules, proving that the copied SQLite state is in use.”

## 10. Verify remote API access from the MacBook

Use Terminal 3, which must be a normal MacBook shell rather than an SSH session:

```bash
cd ~/Documents/labs/habitat-cli
curl -s http://chris-server-j2algy6b:8787/registration |
bun -e 'const v=await Bun.stdin.json(); console.log({registered:Boolean(v.registration),displayName:v.registration?.displayName})'
```

**Say:**

“This request originates on my MacBook and reaches the OpenClaw backend through Tailscale. The sanitized response matches the server-local registration.”

## 11. Show the laptop’s remote-client configuration safely

Run in Terminal 3:

```bash
awk -F= '/^HABITAT_API_BASE_URL=/{print "HABITAT_API_BASE_URL=<configured>"}' .env
```

**Say:**

“The ignored laptop `.env` supplies `HABITAT_API_BASE_URL`. This makes the laptop CLI call the OpenClaw REST API instead of reading the laptop SQLite database directly. I am hiding the actual endpoint in the recording.”

## 12. Match laptop CLI requests to server logs

Place Terminal 1 and Terminal 3 side by side. In Terminal 3 run:

```bash
habitat status
```

Point to the new lines in Terminal 1, such as:

```text
[kepler] GET /habitats/.../registration -> 200
[habitat-api] GET /habitat/status -> 200
[habitat-api] GET /state -> 200
```

**Say:**

“The new server log lines prove that the laptop command reached the deployed backend.”

Run it a second time in Terminal 3:

```bash
habitat status
```

**Say:**

“A second laptop request produces another matching log set. The website and CLI do not read the remote database directly; they communicate with the backend through REST requests.”

## 13. Stop the terminal-owned backend

Return to Terminal 1 and press:

```text
Control-C
```

In Terminal 2 run:

```bash
ss -ltn | grep ':8787'
```

**Say:**

“The listener is gone because the manually owned Bun process stopped. The repository and private files still exist on OpenClaw, but no process is answering API requests.”

## 14. Demonstrate the expected laptop failure

Run in Terminal 3:

```bash
habitat status
```

**Say:**

“The laptop CLI can no longer connect. This expected failure proves that the CLI depended on the remote backend process. A process manager such as `systemd` could keep the backend running without an open SSH terminal, restart it after failures, and start it after a reboot.”

## 15. Show the deployment documentation

Run on the MacBook:

```bash
cd ~/Documents/labs/habitat-cli
sed -n '1,220p' DEPLOYMENT.md
git log --oneline --all --grep='Document manual Habitat deployment' -1
git remote get-url origin
```

**Say:**

“`DEPLOYMENT.md` records the deployed code commit, successful server and laptop checks, matching request logs, shutdown failure, bind-address explanation, and ignored-file explanation. I reviewed it to ensure it contains no private IP addresses, tokens, device codes, or database contents. The GitHub remote shown here is the public repository URL I will submit.”

## 16. Closing statement

**Say:**

“In summary, I deployed the existing Habitat repository to OpenClaw, transferred the ignored environment configuration and SQLite state, ran the backend on `0.0.0.0:8787`, verified REST access inside the server and remotely through Tailscale, used the laptop CLI as a remote client, matched its requests to backend logs, and confirmed that stopping the manual process caused the expected connection failure. No credentials or private state were committed to Git.”

## Submission

Submit this public repository URL with the video:

```text
https://github.com/ChrisGuo9/habitat-cli
```
