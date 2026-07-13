# DevOS — Developer Productivity Discord Bot

A developer-first productivity operating system inside Discord — todos, goals, focus sessions, streaks, XP, and an AI coach, all driven by embeds and buttons instead of typed commands.

## Features (across all phases)

- **Todos** — add/complete/edit/delete via buttons and modals, never typed sub-commands
- **Goals** — track progress with `[0%──────] 0%` progress bars
- **Reminders** — natural language (`/remind tomorrow 8am Gym`) via chrono-node
- **Focus / Pomodoro** — timed work sessions with XP rewards
- **Streaks & Stats** — daily activity streaks, derived productivity score
- **XP & Levels** — quadratic formula `xpForLevel(n) = 50n²`
- **Badges** — declarative registry, auto-evaluated after every XP event
- **Habits** — daily/weekly habit logging via button panels
- **Integrations** — GitHub commits, LeetCode solves, Codeforces rating polled every 15 min
- **AI Coach** — Claude-powered coaching note (cached 24 h), on demand via `/coach`
- **Leaderboard & Challenges** — guild-scoped, public embeds

---

## Setup

### Prerequisites

- Node.js 22+
- Docker & Docker Compose (for Postgres)
- A Discord application with a bot token ([Discord Developer Portal](https://discord.com/developers/applications))

### 1. Clone & install

```bash
git clone <repo-url>
cd devos-bot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID from the Developer Portal |
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | API key for the AI coach (Claude) |
| `GITHUB_TOKEN` | *(optional)* Personal access token — raises GitHub API rate limits for the poller |

### 3. Enable privileged intents in the Discord Developer Portal

> **Important:** The bot uses the **Server Members Intent** (`GuildMembers`) to find which guilds a user shares with the bot — required for the activity broadcast system.
>
> In the [Developer Portal](https://discord.com/developers/applications) → your app → **Bot** → **Privileged Gateway Intents**, enable **Server Members Intent**.
>
> Without this, the bot will start but activity broadcasts will silently fail (zero shared guilds found).

### 4. Run Postgres

```bash
docker-compose up postgres -d
```

Or use any Postgres 14+ instance and set `DATABASE_URL` accordingly.

### 5. Run migrations & generate Prisma client

```bash
npx prisma migrate deploy
npx prisma generate
```

### 6. Build & start

```bash
npm run build
npm start
```

Or in development (no build step):

```bash
npm run dev
```

You should see:

```
Bot ready
```

### 7. Deploy slash commands

```bash
# (command registration script will be added in Phase 1)
node dist/deploy-commands.js
```

---

## Docker (full stack)

```bash
docker-compose up --build
```

This starts `postgres` + `bot`, runs `prisma migrate deploy` on startup, then boots the bot.

---

## Project structure

```
src/
  commands/          # one folder per domain (todo, goals, reminders, …)
  events/
    ready.ts         # fires on login
    interactionCreate.ts  # global router — parses customId, dispatches handlers
  services/          # business logic (todoService, xpService, …)
  database/
    prisma.ts        # singleton PrismaClient
  utils/             # progressBar, customId encode/decode, embedFactory, …
  embeds/            # per-domain embed builders
  badges/
    registry.ts      # declarative badge rules
  cron/              # reminder poller, daily reset, streak check, …
  config/
    env.ts           # zod-validated env vars — fails fast on boot if missing
  index.ts           # entry point
prisma/
  schema.prisma
docker-compose.yml
Dockerfile
```

---

## Conventions

- **One slash command per domain.** `/todo`, `/goal`, `/habit`, etc. are single entry points. Everything after is a button, select menu, or modal.
- **customId format:** `domain:action:ownerId:entityId` — the router verifies ownership before dispatching.
- **All replies are embeds.** No bare string replies ever ship.
- **Personal data is ephemeral; social data is public.**
