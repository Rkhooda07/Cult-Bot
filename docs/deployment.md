# Deployment — KataBump + managed Postgres (Supabase / Neon)

The bot runs as a **plain Node process** on KataBump. Postgres is not deployed
with it: the database is a managed provider (Supabase or Neon), reached over
`DATABASE_URL`. Production runs exactly one process and needs no container
runtime, no reverse proxy, no domain, and no TLS termination.

> This replaces an earlier Koyeb runbook, which itself replaced an Oracle Cloud
> ARM VM runbook. `Dockerfile` and `docker-compose.yml` remain in the repo as a
> **separate, self-contained** self-hosting option. This path does not use them
> and must not grow a dependency on them.

---

## Topology

```
  KataBump instance                        Supabase / Neon
  ┌─────────────────────────┐              ┌────────────┐
  │ node dist/index.js      │─DATABASE_URL─▶│  Postgres  │
  │  ├─ Discord gateway ────┼─▶ outbound WSS└────────────┘
  │  └─ HTTP :8000/health   │
  └─────────────────────────┘
```

Migrations are **not** run at boot on this path — you apply them from your own
machine before deploying (Phase 2). That is a deliberate difference from the
Docker path, whose `CMD` runs `prisma migrate deploy` on every start. Keeping
migrations out of the start command removes the entire class of
"SIGKILL landed mid-migration" failures described under *Troubleshooting*.

---

## Commands

| Stage | Command |
|---|---|
| Install | `npm install` |
| Build | `npm run build` |
| Start | `npm start` |

`npm run build` is `prisma generate && tsc`. The `prisma generate` is load
bearing on a fresh host — `@prisma/client`'s own postinstall hook does not fire
reliably across every install and cache path, and without a generated client the
first query throws at runtime rather than at build time.

`npm start` is `node dist/index.js`. It requires **no** `ts-node` and no dev
dependencies at runtime. If KataBump lets you prune dev dependencies after the
build step, that is safe.

**`npm run deploy` is not part of this sequence.** Command registration uses
`ts-node` and talks only to Discord's API — never to the database — so it runs
from your local machine, not the host. See Phase 3.

---

## Phase 1 — Provision the database

Create a project on [Supabase](https://supabase.com) or
[Neon](https://neon.tech) and copy the connection URI.

Both require SSL. The URI must end in `?sslmode=require`:

```
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Nothing in the codebase parses, rewrites, or assumes anything about this string
— `prisma/schema.prisma` passes `env("DATABASE_URL")` straight through, and
`src/database/prisma.ts` never touches host, port, or SSL settings. Whatever the
provider gives you is what Prisma uses.

If the password contains `@`, `/`, `:`, or `?`, URL-encode it, or the URI parses
wrongly and you get an authentication error that looks like a network fault.

**Supabase specifically:** use the **connection pooler** URI (port `6543`), not
the direct one (port `5432`). The direct connection has a low concurrent limit
that the cron pollers will exhaust.

Verify the string works before deploying anything:

```bash
DATABASE_URL='postgresql://...?sslmode=require' npx prisma migrate status
```

Expect a statement about migration state — not a connection error. This is the
single check that proves SSL, credentials, and network reachability at once.

## Phase 2 — Migrate and seed, once, from your machine

Both commands run **locally**, against the remote database, before the first
deploy. Set `DATABASE_URL` in your local `.env` to the remote URI first, or
prefix each command as shown.

```bash
# 1. Create the schema
DATABASE_URL='postgresql://...?sslmode=require' npx prisma migrate deploy

# 2. Seed the badge definitions
DATABASE_URL='postgresql://...?sslmode=require' npm run db:seed
```

The seed is **not** optional. Badge definitions live in `prisma/seed.ts`, and
the badge system reads from that table — skipping it leaves badges silently
non-functional rather than visibly broken.

Re-run `migrate deploy` from your machine whenever a migration is added. Re-run
the seed only when badge definitions change; it is written to be idempotent.

## Phase 3 — Register slash commands

From your local machine, once, and again whenever a command *definition*
changes (name, description, or options — not handler logic):

```bash
npm run deploy
```

`src/deploy-commands.ts` reads `GUILD_ID` from your environment:

- **`GUILD_ID` set** → commands register to that one guild and appear within
  seconds. Best for testing.
- **`GUILD_ID` unset** → commands register globally and take **up to an hour**
  to propagate to all servers.

Also enable **Server Members Intent** in the Discord Developer Portal
(Bot → Privileged Gateway Intents). `src/index.ts` requests `GuildMembers`;
without it `client.login()` throws `Used disallowed intents` and the process
restart-loops.

## Phase 4 — Environment variables

Set these in KataBump's dashboard, never in the repo. This list is derived from
`src/config/env.ts`, which validates every variable with zod at boot and refuses
to start if a required one is missing or malformed.

**Required — the process will not boot without these:**

| Variable | Notes |
|---|---|
| `DISCORD_TOKEN` | Bot token from the Developer Portal. |
| `DISCORD_CLIENT_ID` | Application ID. |
| `DATABASE_URL` | Full URI including `?sslmode=require`. |

**Optional:**

| Variable | Default | Notes |
|---|---|---|
| `GITHUB_TOKEN` | unset | Not required to boot, but the GitHub integration is rate-limited to 60 req/h unauthenticated and the poller runs every 2 min. Set it if you use `/link github`. `src/cron/githubPoller.ts` warns at startup when unset. |
| `PORT` | `8000` | Port for the health endpoint. Leave unset unless KataBump injects or requires a specific one. |
| `BOT_ICON_URL` | unset | Overrides the embed footer icon. Leave unset — it falls back to the bot's own Discord avatar. A blank value is treated as "off"; a non-empty non-URL is rejected at boot. |
| `AUTO_SET_AVATAR` | unset | When exactly `"true"`, the bot sets its own avatar once at startup. Discord rate-limits this heavily. Prefer uploading the icon via the Developer Portal. |
| `LOG_LEVEL` | `info` | Read directly by `src/utils/logger.ts`. |
| `DEBUG_TIMING` | unset | When `"true"`, logs per-query and startup timings at debug level. Noisy; leave off in production. |

`GUILD_ID` is **not** needed on the host — it is only read by the local
`npm run deploy` script.

## Phase 5 — Health endpoint (optional on this host)

`src/server/healthServer.ts` serves `GET /health` and `GET /` on `PORT`,
returning `200` whenever the process is alive with gateway state in the body:

```json
{
  "status": "ok",
  "discord": { "connected": true, "wsPing": 62, "guilds": 2, "user": "cult-bot#9905" },
  "uptimeSeconds": 3471
}
```

It was added for Koyeb, which required a port to probe and slept instances
without inbound HTTP traffic. **KataBump is a bot-specific host that keeps the
process running, so neither reason applies here.** It is kept because it is the
fastest way to answer "is the gateway actually connected?" without reading logs,
it costs nothing while idle, and it keeps the Docker path working unchanged.

If KataBump does not expose a port, the server still binds harmlessly and the
bot is unaffected. Nothing else depends on it.

`wsPing` is `null` for roughly the first 41 seconds of uptime — discord.js
reports `-1` until the first heartbeat ack. Not a fault.

---

## Redeploy loop

```bash
git push origin main    # if autodeploy is enabled; otherwise trigger in the dashboard
```

Only when a migration was added:

```bash
DATABASE_URL='...' npx prisma migrate deploy    # from your machine, BEFORE the deploy lands
```

Only when a command definition changed:

```bash
npm run deploy
```

---

## Troubleshooting

### ⚠️ Never run two instances against one token

**Stop your local `npm run dev` before the deployed instance goes live.** Two
processes logged into the same bot token fight over the gateway session: the bot
flickers between online and offline, interactions are handled by whichever
instance wins the race, and some fail outright with "The application did not
respond" because the other instance answered first.

The symptom is intermittent and looks like a bug in the bot rather than a
duplicate process, which is what makes it expensive to diagnose. If behavior is
erratic right after your first deploy, check this before anything else.

```bash
pgrep -fl "ts-node src/index.ts|node dist/index.js"
```

Use a **separate bot application and token** if you want to keep developing
locally against a live deployment.

### Bot shows offline

1. **Check the host's runtime logs first**, not the build logs. A successful
   build tells you nothing about whether the process started.
2. A clean boot logs the cron registrations, then `Health server listening`,
   then `Bot ready` with the bot's tag.
3. **A stack trace listing environment variables** means `src/config/env.ts`
   rejected the config at boot — the message names each offending variable.
   The process exits rather than starting half-configured.
4. **`Used disallowed intents`** → Server Members Intent is not enabled
   (Phase 3).
5. **An invalid-token error** → `DISCORD_TOKEN` is wrong, or was regenerated in
   the Developer Portal. Regenerating invalidates the old one immediately.
   Watch for a trailing space or newline when pasting into the dashboard.
6. **No output at all** → the start command is wrong. It must be `npm start`,
   and `npm run build` must have run first. `npm start` runs `node
   dist/index.js`; if `dist/` was never built, Node exits instantly with
   "Cannot find module".

### Commands don't appear in Discord

Almost always a `npm run deploy` problem, not a deployment problem — the host
never registers commands.

1. **Did you run `npm run deploy` at all?** It is a separate manual step and is
   deliberately not part of the start sequence.
2. **Global registration takes up to an hour.** If `GUILD_ID` was unset, wait.
   To test immediately, set `GUILD_ID` to your server's ID and re-run.
3. **Registered to the wrong place.** Commands registered with `GUILD_ID` set
   appear *only* in that guild. If you tested in one server and deployed to
   another, register globally (unset `GUILD_ID`) or re-run per guild.
4. **Wrong application.** `DISCORD_CLIENT_ID` in your local `.env` must be the
   same application as the `DISCORD_TOKEN` running on the host. Mismatched pairs
   register commands to a bot that is not in your server.
5. Commands appearing but failing with "application did not respond" is a
   *runtime* problem — check for two running instances, above.

### Database connection errors

1. **`sslmode=require` missing.** Both Supabase and Neon reject non-SSL
   connections. Confirm the URI ends in `?sslmode=require`. This is the most
   common cause and the error text rarely mentions SSL directly.
2. **Reproduce it from your machine** — this separates a bad connection string
   from a host networking problem:
   ```bash
   DATABASE_URL='postgresql://...?sslmode=require' npx prisma migrate status
   ```
   Fails locally too → the string is wrong. Works locally but not on the host →
   the variable is wrong or missing in the dashboard.
3. **Password not URL-encoded.** A raw `@`, `/`, `:`, or `?` in the password
   breaks URI parsing and surfaces as an authentication failure.
4. **`Table does not exist`** → `prisma migrate deploy` was never run against
   this database (Phase 2).
5. **Badges do nothing, no error** → the seed was skipped (Phase 2, step 2).
6. **Connection-limit errors on Supabase** → you are on the direct URI. Switch
   to the pooler (port `6543`).
7. **First query after idle is slow, then fine** → Neon auto-suspended.
   `src/cron/dbKeepAlive.ts` pings every 4 minutes to prevent this, and
   `src/index.ts` fires a warm-up query at startup. Expected, not a fault.

### Redeploys hang or the process won't stop

`src/index.ts` handles `SIGINT` and `SIGTERM`: it closes the health server,
destroys the Discord client, disconnects Prisma, and exits `0` — typically in
well under a second. A 10-second watchdog forces exit `1` if any step hangs, so
the process always terminates rather than waiting to be `SIGKILL`ed.

An exit code of `1` in the host's logs on shutdown means the watchdog fired —
the process did stop, but something was wedged. Worth investigating; not
data-threatening on this path, since migrations do not run at boot here.

---

## Resource notes

Steady state is roughly 250–350 MB: Node baseline (~60 MB), discord.js with the
`GuildMembers` cache, the Prisma query engine (~80 MB), and `@napi-rs/canvas`,
which allocates its bitmap only while rendering a `/dev-stats` contribution
graph. If the host reports OOM kills, that render is the only allocation that
spikes and is the first place to look.

`@napi-rs/canvas` ships prebuilt native binaries. If KataBump's architecture
differs from your Mac's, it resolves the correct one at install time — but this
is the one dependency that would fail on an unusual platform, and it fails at
install, not at runtime.

---

## Secret handling

Set secrets in the host dashboard only. If you use the Docker path locally,
never run `docker compose config` without `--services` or `--quiet`: it
interpolates `env_file` values and prints `DISCORD_TOKEN` and the database
password in cleartext into your scrollback.
