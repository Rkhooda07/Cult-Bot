# Deployment — Koyeb (free tier) + Neon

The bot runs as a single container on Koyeb. Postgres is **not** deployed with
it: the database is Neon (serverless, external), reached over `DATABASE_URL`.
Production therefore runs exactly one process — the bot — and needs no local
Postgres container, no reverse proxy, no domain, and no TLS.

> This replaces an earlier Oracle Cloud ARM VM runbook. Oracle was dropped
> because its account verification requires a payment card. The tradeoff is
> recorded under *Alternatives* below in case a VM is ever needed again.

---

## Topology

```
  Koyeb free instance                      Neon (us-east-1)
  ┌─────────────────────────┐              ┌────────────┐
  │ node dist/index.js      │─DATABASE_URL─▶│  Postgres  │
  │  ├─ Discord gateway ────┼─▶ outbound WSS└────────────┘
  │  └─ HTTP :8000/health ◀─┼── inbound, from the uptime pinger
  └─────────────────────────┘
```

Two details drive everything below:

- **The gateway connection is outbound.** Free tiers scale to zero on absent
  *inbound HTTP* traffic. A permanently-connected WebSocket does not count, so
  without the pinger the instance suspends roughly hourly and the bot drops
  offline. The pinger is load-bearing, not a nicety.
- **`DATABASE_URL` must point at Neon.** There is no local DB in this path;
  `docker-compose.yml` deliberately does not override it. Because Neon
  auto-suspends on idle, `src/cron/dbKeepAlive.ts` keeps the connection warm and
  `DATABASE_URL` carries raised `connect_timeout` / `pool_timeout` values. Do
  not strip those.

---

## Why the health endpoint exists

`src/server/healthServer.ts` runs inside the bot process and serves
`GET /health` (and `GET /`) on `PORT` (default `8000`).

It is a **liveness** probe, not a readiness one — it returns `200` whenever the
process is alive, and reports gateway state in the body rather than in the
status code. Returning `503` on a disconnected gateway would read better, but
Koyeb restarts an instance whose health check fails, and discord.js reconnects
on its own after transient drops. A `503` would convert a five-second blip into
a restart loop, each cycle re-running `prisma migrate deploy`.

```json
{
  "status": "ok",
  "discord": { "connected": true, "wsPing": 62, "guilds": 2, "user": "cult-bot#9905" },
  "uptimeSeconds": 3471
}
```

`wsPing` is `null` for the first ~41 seconds of uptime — discord.js reports
`-1` until the first heartbeat ack. Not a fault.

It binds `0.0.0.0`, never `localhost`. A loopback bind inside a container is
invisible to the platform's health checker and the deploy fails with no useful
error. It also starts *before* `client.login()`, so a slow handshake surfaces as
an answering-but-not-yet-connected service rather than a port that never opens.

---

## Phase 1 — Koyeb account

1. Sign up at [koyeb.com](https://www.koyeb.com) with **GitHub** — it doubles as
   the repo connection in Phase 2.
2. If Koyeb asks for a payment card to verify, stop and reconsider the host (see
   *Alternatives*). Free-tier terms change; this runbook assumes the one free
   instance is available without one.

## Phase 2 — Create the service

**Create Web Service** → **GitHub** → authorize → pick `Rkhooda07/cult-bot`.

| Setting | Value | Why |
|---|---|---|
| Builder | **Dockerfile** | *Not* buildpacks. `@napi-rs/canvas` and the Prisma engines need the exact image the Dockerfile builds. |
| Branch | `main` | |
| Autodeploy | **on** | Pushes to `main` redeploy automatically. |
| Instance | **Free** (0.1 vCPU / 512 MB) | |
| Region | **Washington, D.C.** | Neon is in `us-east-1`. Frankfurt adds ~90 ms to *every* query. |
| Port | **8000**, HTTP | Must match `PORT`. |
| Health check path | `/health` | |

## Phase 3 — Environment variables

Set in Koyeb's dashboard, **never** in the repo. Mark `DISCORD_TOKEN`,
`DATABASE_URL`, and `GITHUB_TOKEN` as **Secret** so they are write-only after
saving.

| Variable | Notes |
|---|---|
| `DISCORD_TOKEN` | Required. |
| `DISCORD_CLIENT_ID` | Required. |
| `DATABASE_URL` | Required. The full Neon pooler URI including `?sslmode=require`. |
| `GITHUB_TOKEN` | Optional at boot, required for the GitHub integration to function. |
| `PORT` | Leave unset — Koyeb injects it. |

Do **not** set `BOT_ICON_URL` or `AUTO_SET_AVATAR`; the footer icon falls back
to the bot's uploaded Discord avatar.

## Phase 4 — Keep-alive pinger

Without this the instance sleeps after ~1 h idle and the bot goes offline.

**cron-job.org:**

1. Create account → **Create cronjob**
2. URL: `https://<your-app>-<org>.koyeb.app/health`
3. Schedule: **every 5 minutes**
4. Save, then **Test run** — expect `200` and the JSON above.

UptimeRobot works equally well (HTTP(s) monitor, 5-minute interval) and adds
down-alerts by email.

Pick **5 minutes, not 10.** Ten leaves no margin: two consecutive failed pings
puts you at a 20-minute gap against an idle timer whose exact threshold Koyeb
does not contractually guarantee.

## Phase 5 — Register slash commands

Only needed on first deploy and whenever a command *definition* changes:

```bash
npm run deploy    # from your Mac; reads .env, talks only to Discord's API
```

Global registration takes up to an hour to propagate.

Also confirm **Server Members Intent** is enabled in the Discord Developer
Portal (Bot → Privileged Gateway Intents). `src/index.ts` requests
`GuildMembers`; without it `client.login()` throws `Used disallowed intents`
and the instance restart-loops.

---

## Verifying a deploy

```bash
# 1. Health endpoint — the single most informative check
curl -s https://<your-app>.koyeb.app/health | jq
```

`connected: true` with `guilds > 0` means the gateway is genuinely up.
`connected: false` on a large `uptimeSeconds` means a wedged bot — redeploy.

**2. Logs** — Koyeb dashboard → service → **Logs** (`Runtime`, not `Build`).
A clean boot looks like:

```
Health server listening on 0.0.0.0
No pending migrations to apply
Logged in as cult-bot#9905
```

**3. Migration state.** This is the failure mode the `exec` in the Dockerfile
`CMD` exists to prevent, so verify it at least once after a redeploy:

```bash
npx prisma migrate status    # from your Mac, against the same Neon DB
```

Expect *"Database schema is up to date"*. If a migration is ever reported as
failed, one boot was SIGKILLed mid-`migrate deploy` and left a
`_prisma_migrations` row with `finished_at IS NULL`. Every subsequent boot then
fails until you run `npx prisma migrate resolve --applied <migration_name>`.

Why it should not happen: Koyeb sends `SIGTERM` on redeploy, the Dockerfile
`exec`s so node is PID 1 and receives it, and `src/index.ts` handles it and
exits 0 in ~3 s rather than hanging until a `SIGKILL`.

**4. Concurrent migrations.** Koyeb's rolling deploy briefly runs the new
instance while the old one still lives, so two `prisma migrate deploy` calls can
overlap against one Neon database. Prisma takes a Postgres advisory lock for
exactly this, so the second waits rather than corrupting state — but a deploy
carrying a slow migration can take noticeably longer than a normal one.

---

## Redeploy loop

```bash
git push origin main       # autodeploy handles the rest
npm run deploy             # only when a command definition changed
```

---

## Resource headroom

512 MB is comfortable but not generous. Steady state is roughly 250–350 MB:
Node baseline (~60 MB), discord.js with the `GuildMembers` cache for ~50 members
(small), the Prisma query engine (~80 MB), and `@napi-rs/canvas`, which
allocates its bitmap only while rendering a `/dev-stats` contribution graph.

If Koyeb reports OOM kills, that render is the first place to look — it is the
only allocation that spikes.

---

## Alternatives, if the Koyeb free tier disappears

- **Fly.io** — same shape (Dockerfile, scale-to-zero, external DB). Needs a card
  on file even for free allowances.
- **A Raspberry Pi / spare machine at home** — the only option that depends on
  nobody's free tier. Same Docker image, `restart: unless-stopped`, and no
  pinger needed since nothing scales to zero.
- **Oracle Cloud Always Free ARM VM** — genuinely free and generous (4 OCPU /
  24 GB), needs no keep-alive pinger, but requires card verification at signup
  and Ampere A1 capacity is frequently unavailable. If revisiting: build on the
  VM, not cross-built from macOS — `prisma/schema.prisma` sets no
  `binaryTargets`, so engines are generated for whatever platform runs
  `prisma generate`.

---

## Secret handling

Never run `docker compose config` without `--services` or `--quiet`. It
interpolates `env_file` values and prints `DISCORD_TOKEN` and the Neon password
in cleartext to the terminal — and therefore into any scrollback, log, or
transcript.
