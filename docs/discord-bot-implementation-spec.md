# Developer Productivity Bot — Implementation Spec (v1.0)

**Codename:** DevOS (working name — rename as you like)
**One-liner:** A developer-first productivity operating system inside Discord — todos, goals, focus sessions, streaks, XP, and an AI coach, all driven by embeds and buttons instead of typed commands.

This document is the single source of truth. Any AI agent building this should read this file in full before writing code, and should not deviate from the locked decisions in Section 2 without flagging it to you first.

---

## 1. Design Principles (non-negotiable)

1. **Buttons and select menus first, typing only when unavoidable.** Free-text input (task content, goal titles) uses a Discord Modal — one popup form, not a slash-command sentence.
2. **One slash command per domain, no second typed command in the same flow.** `/todo`, `/goal`, `/habit`, `/focus`, etc. are each a *single* entry point. Once that panel is open, everything after it is a button, a select menu, or a modal — never a follow-up typed command like `/goal add` or `/habit log`. (This was under-specified for Goals and Habits in earlier drafts — Section 7 now fixes that.)
3. **Every reply is an embed.** No bare-string replies like "Task added." ever ship.
4. **Personal data is ephemeral, social data is public.** Your todo list is only visible to you; leaderboards and challenges post in-channel.
5. **Phases are sequential and each ends in a working, demoable bot.** Do not start Phase 2 work inside a Phase 1 pull request.
6. **Consistency over cleverness.** One embed color system, one emoji legend, one custom_id convention, reused everywhere.

---

## 2. Locked Architecture Decisions

Your original plan left these open. They're locked now so every phase builds on the same assumptions.

| Decision | Call | Why |
|---|---|---|
| Data scope | Todos, goals, habits, XP, streaks are **per-user, global** (not per-server). Leaderboards, challenges, and announcements are **per-guild**. | A user's todo list shouldn't reset because they DM the bot vs. use it in a different server. |
| "No typing" claim | Buttons/selects drive navigation and actions. Text entry (add/edit todo, goal title) opens a **Modal**. This is still zero slash-command typing after the initial `/todo` call. | Free text can't be replaced by buttons; a Modal is the honest way to keep it frictionless. |
| Interaction persistence | Use a **global interaction router** (`events/interactionCreate.ts`) that parses `customId` and dispatches — not `awaitMessageComponent` collectors — for anything that must survive a bot restart. Collectors are fine only for short-lived confirms (<2 min). | Collectors die on process restart; panels people revisit hours later would silently break. |
| Button ownership | Every `customId` encodes the owner: `domain:action:ownerId:entityId`. On click, verify `interaction.user.id === ownerId`, else reply ephemeral "This isn't your panel." | Prevents anyone in a channel from tapping someone else's buttons. |
| Reminders delivery (Phase 1) | A **cron job polling the DB every 60s** for due, unsent reminders. Upgrade path to BullMQ + Redis is noted for Phase 2+ if volume grows past a few hundred concurrent reminders. | Keeps MVP infra simple (no Redis dependency day one) while leaving a clear upgrade path. |
| Timezones | `User.timezone` (IANA string, e.g. `Asia/Kolkata`) set via `/settings timezone`, defaults to UTC. All "tomorrow 8am"-style parsing and daily resets use this. | Without it, `/remind tomorrow 8am` and daily streak resets are wrong for anyone outside UTC. |
| Natural-language time parsing | `chrono-node` for `/remind 2h`, `/remind tomorrow 8am`. | Purpose-built for exactly this; don't hand-roll a parser. |
| Pagination | Todo/goal lists >8 items get a `StringSelectMenu` "jump to page" + prev/next buttons, not a giant embed. | Keeps embeds readable on mobile. |
| List truncation | 8 items per embed page, matching Discord embed field practical limits on mobile. | |
| XP formula | `xpForLevel(n) = 50 * n²` (cumulative). Level-up triggers a one-off "Level Up!" embed. | Standard quadratic RPG curve — fast early levels, meaningful late ones. |
| Badge system | Declarative rule list (`badges/registry.ts`): `{ key, name, icon, check(userStats): boolean }`, evaluated after any XP-earning event. Not scattered `if` checks across features. | One place to add/audit badges. |
| AI Coach cadence | Runs on-demand via `/coach`, but caches its output for **24h per user** to avoid redundant LLM calls. | Coaching advice doesn't need to be regenerated every tap. |
| GitHub/LeetCode/Codeforces sync | **Polling**, not webhooks, for MVP (cron every 15 min checks each linked account for new activity). Webhooks are a documented future upgrade, not Phase 4 scope. | Webhooks need a public HTTPS endpoint + GitHub App setup — real infra work that shouldn't block Phase 4. |
| Multi-server install | Bot is installable to multiple guilds. `GuildSettings` table holds per-guild config (announce channel, leaderboard opt-in). | |
| Version control | Agent runs `git init` in Prompt 0 with an initial commit, then commits at the end of **every** subsequent prompt using Conventional Commits (`feat:`, `fix:`, `chore:`) with a short, specific message — never a vague "updates". Pushes to `origin` after each commit if a remote is configured; if none is set up, commits stay local and that's fine, don't block on it. | One commit per feature gives you a clean, reviewable history and an easy rollback point the moment a later prompt breaks something Phase 3+. |
| Activity broadcasts | GitHub/LeetCode/Codeforces activity (and later, level-ups/badges) posts to a guild's `announceChannelId` **only if an admin has configured one there** (Section 12). No config = no broadcast in that guild. Users can also fully opt out via `/settings broadcast off`. | A user's dev accounts are linked once, globally — but they may share several servers with the bot. Broadcasting everywhere by default would spam every mutual server; making it per-guild opt-in avoids that while still giving communities the "push commits → bot announces it" feel your original plan wanted. |

---

## 3. Tech Stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript | strict mode on |
| Bot framework | discord.js v14 | Components v2 (buttons, select menus, modals) |
| ORM | Prisma | migrations checked into repo |
| Database | PostgreSQL | |
| Cron | node-cron | Phase 1–3; revisit BullMQ+Redis if reminder/job volume grows |
| Cache/queue (optional, Phase 2+) | Redis + BullMQ | only if reminder polling proves insufficient |
| Validation | zod | validate all modal/command input before DB writes |
| Date/time parsing | chrono-node | natural language ("tomorrow 8am") |
| Date/time math | luxon | timezone-aware arithmetic |
| Logging | pino | structured logs, not console.log |
| AI coach | Anthropic API (Claude) | see Section 9 |
| Containerization | Docker + docker-compose | bot + postgres (+ redis if used) |

---

## 4. Data Model (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id // discord user id
  username  String
  timezone  String   @default("UTC")
  xp        Int      @default(0)
  level     Int      @default(1)
  broadcastEnabled Boolean @default(true)
  createdAt DateTime @default(now())

  todos            Todo[]
  goals            Goal[]
  reminders        Reminder[]
  habits           Habit[]
  pomodoroSessions PomodoroSession[]
  xpLogs           XPLog[]
  badges           UserBadge[]
  streak           Streak?
  githubLink       GithubLink?
  leetcodeLink     LeetCodeLink?
  codeforcesLink   CodeforcesLink?
  challengeEntries ChallengeParticipant[]
}

model Todo {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  content   String
  done      Boolean   @default(false)
  createdAt DateTime  @default(now())
  doneAt    DateTime?
  dueDate   DateTime?
}

model Goal {
  id          String     @id @default(cuid())
  userId      String
  user        User       @relation(fields: [userId], references: [id])
  title       String
  deadline    DateTime?
  status      GoalStatus @default(IN_PROGRESS)
  progress    Int        @default(0) // 0-100
  createdAt   DateTime   @default(now())
  completedAt DateTime?
}

enum GoalStatus {
  IN_PROGRESS
  COMPLETED
  ABANDONED
}

model Reminder {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  channelId String
  message   String
  remindAt  DateTime
  sent      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model Habit {
  id        String         @id @default(cuid())
  userId    String
  user      User           @relation(fields: [userId], references: [id])
  name      String
  frequency HabitFrequency @default(DAILY)
  createdAt DateTime       @default(now())
  logs      HabitLog[]
}

enum HabitFrequency {
  DAILY
  WEEKLY
}

model HabitLog {
  id        String   @id @default(cuid())
  habitId   String
  habit     Habit    @relation(fields: [habitId], references: [id])
  date      DateTime
  completed Boolean  @default(true)
}

model PomodoroSession {
  id          String        @id @default(cuid())
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  durationMin Int
  startedAt   DateTime      @default(now())
  completedAt DateTime?
  status      SessionStatus @default(IN_PROGRESS)
}

enum SessionStatus {
  IN_PROGRESS
  COMPLETED
  ABANDONED
}

model Streak {
  id             String    @id @default(cuid())
  userId         String    @unique
  user           User      @relation(fields: [userId], references: [id])
  current        Int       @default(0)
  best           Int       @default(0)
  lastActiveDate DateTime?
}

model XPLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  amount    Int
  reason    String
  createdAt DateTime @default(now())
}

model Badge {
  id          String      @id @default(cuid())
  key         String      @unique
  name        String
  description String
  icon        String
  users       UserBadge[]
}

model UserBadge {
  id       String   @id @default(cuid())
  userId   String
  user     User     @relation(fields: [userId], references: [id])
  badgeId  String
  badge    Badge    @relation(fields: [badgeId], references: [id])
  earnedAt DateTime @default(now())

  @@unique([userId, badgeId])
}

model GithubLink {
  id            String  @id @default(cuid())
  userId        String  @unique
  user          User    @relation(fields: [userId], references: [id])
  username      String
  lastCommitSha String?
}

model LeetCodeLink {
  id              String @id @default(cuid())
  userId          String @unique
  user            User   @relation(fields: [userId], references: [id])
  username        String
  lastSolvedCount Int    @default(0)
}

model CodeforcesLink {
  id         String @id @default(cuid())
  userId     String @unique
  user       User   @relation(fields: [userId], references: [id])
  handle     String
  lastRating Int?
}

model GuildSettings {
  id                String  @id // discord guild id
  announceChannelId String?
  leaderboardOptIn  Boolean @default(true)
}

model CommunityChallenge {
  id           String                 @id @default(cuid())
  guildId      String
  title        String
  description  String
  startsAt     DateTime
  endsAt       DateTime
  participants ChallengeParticipant[]
}

model ChallengeParticipant {
  id          String             @id @default(cuid())
  challengeId String
  challenge   CommunityChallenge @relation(fields: [challengeId], references: [id])
  userId      String
  user        User               @relation(fields: [userId], references: [id])
  completed   Boolean            @default(false)
  joinedAt    DateTime           @default(now())

  @@unique([challengeId, userId])
}
```

---

## 5. Folder Structure (final)

```
src/
  commands/
    todo/          (todo.ts + subcommand handlers)
    goals/
    reminders/
    stats/
    habits/
    focus/
    settings/       (timezone, links)
    coach/
    leaderboard/
    challenge/
  events/
    ready.ts
    interactionCreate.ts   ← global router, parses customId
  services/
    todoService.ts
    goalService.ts
    xpService.ts
    badgeService.ts
    streakService.ts
    reminderService.ts
    githubService.ts
    leetcodeService.ts
    codeforcesService.ts
    coachService.ts
  database/
    prisma.ts       (singleton client)
  utils/
    progressBar.ts
    customId.ts      (encode/decode helpers)
    embedFactory.ts
    permissions.ts
  embeds/
    todoEmbed.ts
    goalEmbed.ts
    statsEmbed.ts
    ...
  badges/
    registry.ts
  cron/
    reminderPoller.ts
    dailyReset.ts
    streakCheck.ts
    weeklyRecap.ts
    githubPoller.ts
    leetcodePoller.ts
    codeforcesPoller.ts
  config/
    env.ts           (zod-validated env vars)
  index.ts
```

---

## 6. UI System

### 6.1 Color palette (embed color per domain)

| Domain | Hex | Note |
|---|---|---|
| Todo | `#5865F2` | Discord blurple |
| Goals | `#9B59B6` | |
| Reminders | `#E67E22` | |
| Focus / Pomodoro | `#E74C3C` | |
| Streaks | `#FF6B35` | |
| Stats | `#2ECC71` | |
| XP / Level | `#F1C40F` | |
| Badges | `#1ABC9C` | |
| Leaderboard | `#F1C40F` (with 🥇🥈🥉 inline) | |
| AI Coach | `#6C5CE7` | |
| Errors | `#ED4245` | |

### 6.2 Emoji legend (used consistently everywhere, never swapped)

`☐` open task · `✔` done · `⏳` in progress · `⭕` not started · `🔥` streak · `🎯` goal · `⏰` reminder · `📝` todo · `📅` planner · `🏆` badge/achievement · `📈` stats · `🤖` AI coach · `🌱` habit

### 6.3 Progress bar utility

```ts
function progressBar(percent: number, length = 10): string {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}
```

### 6.4 customId convention

`domain:action:ownerId:entityId`
Example: `todo:complete:8213...:ckx91a...`
The router splits on `:`, checks `ownerId === interaction.user.id`, dispatches to the matching handler.

### 6.5 Modals

Used only for free-text entry: add/edit todo content, goal title, habit name, reminder message. Every modal has a matching zod schema validated before DB write; validation errors reply ephemeral, not silently fail.

**Hard technical limit:** Discord modals only support text-input fields — no buttons, no select menus, no dropdowns inside a modal. Anywhere the feature needs both free text *and* a picker in the same "add" step (e.g., a habit's name *and* its daily/weekly frequency), use a **two-step flow**: the modal collects the text field(s) and submits; the bot's follow-up message then shows a select menu or buttons for the picker choice, and the record is only finalized once that's picked. Do not let an agent try to nest a `StringSelectMenuBuilder` inside a `ModalBuilder` — it will either error or silently produce something broken.

### 6.6 Reply visibility

Personal panels (`/todo`, `/goal`, `/today`, `/stats`, `/coach`) reply **ephemeral**. Social features (`/leaderboard`, challenge announcements, level-up/badge-earned notifications if the user opts in) reply **public**.

---

## 7. Command & Interaction Reference

### Phase 1 — Todos, Goals, Reminders, Planner

| Command | Behavior |
|---|---|
| `/todo` | Opens ephemeral panel: list (paginated), buttons `[Complete] [Edit] [Delete] [Add]`. `Add`/`Edit` open a Modal. `Complete`/`Delete` open a select menu if >1 item. |
| `/goal` | Single entry point. Opens an ephemeral panel: goal list with status icons (⏳ in progress, ✔ complete, ⭕ not started/stalled) + buttons `[Add] [Update Progress] [Complete] [Delete]`. `Add` opens a Modal (title, optional deadline as free text — e.g. "30 August" — parsed via chrono-node). `Update Progress` / `Complete` / `Delete` open a select menu to pick which goal first when there's more than one. No separate `/goal add` or `/goal list` command exists — this was a Phase 1 inconsistency in earlier drafts, now fixed to match Design Principle 2. |
| `/remind <natural language>` | e.g. `/remind 2h Continue FlowPane`, `/remind tomorrow 8am Gym`. Parsed via chrono-node in the user's timezone. |
| `/remind list` | Shows upcoming reminders with a cancel button per row. |
| `/today` | Aggregates: today's open todos, reminder count for today, current goal progress %. |
| `/settings timezone <IANA tz>` | Sets `User.timezone`. |
| `/settings broadcast <on\|off>` | Sets `User.broadcastEnabled`. When off, this user's dev activity (Section 12) never posts to any guild channel, even if the guild has one configured. Default: on. |

### Phase 2 — Focus, Streaks, Stats

| Command | Behavior |
|---|---|
| `/focus start [minutes=25]` | Creates a `PomodoroSession`, shows a live-updating embed ("Working... 12:34 left") via message edits every ~30s, or a static embed + a `[Mark Complete]` button if live countdown is deferred. On completion: +25 XP, streak update. |
| `/focus stop` | Marks the active session abandoned. |
| `/streak` | Shows current + best streak with flame visual. |
| `/stats` | Tasks completed, goals finished, current streak, focus hours, a derived "Productivity Score." |

### Phase 3 — XP, Badges, Habits

| Command | Behavior |
|---|---|
| (implicit) | Any XP-earning action (todo done, goal done, focus session complete, habit logged) calls `xpService.award()`, which checks level-up and badge criteria. |
| `/level` | Shows level, XP bar via `progressBar()`. |
| `/badges` | Grid of earned vs. locked badges. |
| `/habit` | Single entry point (Design Principle 2). Opens an ephemeral panel: habit list with today's check-off state + buttons `[Add] [Check Off] [Delete]`. `Add` uses the two-step flow from Section 6.5: a Modal collects just the habit name, then the bot's follow-up message shows a select menu (Daily / Weekly) to set frequency — the `Habit` row is only created once that's picked. `Check Off` toggles today's `HabitLog`, via select menu first if there's more than one habit. No separate `/habit add` or `/habit log` command. |
| `/habit log` | Button-driven daily check-off panel, similar to `/todo`. |

### Phase 4 — Integrations

| Command | Behavior |
|---|---|
| `/link github <username>` | Stores `GithubLink`. Cron polls every 15 min; new commits award +20 XP each (capped per day to prevent farming — cap at 5/day). Also broadcasts per Section 12. |
| `/link leetcode <username>` | Cron polls solved count; new solves award XP. Also broadcasts per Section 12. |
| `/link codeforces <handle>` | Cron polls rating/solve changes. Also broadcasts per Section 12. |
| `/dev-stats` | Combined embed: today's commits, LeetCode solved today, CF streak. |

### Phase 5 — Coach, Leaderboard, Community

| Command | Behavior |
|---|---|
| `/coach` | Pulls last 7 days of activity, sends to Claude with the coaching prompt template (Section 9), returns a short embed. Cached 24h. |
| `/leaderboard [weekly\|alltime]` | Public embed, top 10 by XP, guild-scoped. |
| `/settings announce-channel <#channel>` (admin only, `ManageGuild`) | Sets `GuildSettings.announceChannelId`. Required before this guild receives any dev-activity broadcast (Section 12) or weekly recap post. No channel set = bot only DMs, never posts here. |
| `/challenge create` (admin only) | Modal: title, description, end date. Posts announcement embed with a `[Join]` button. |
| `/challenge complete` | Marks the caller's participation complete. |
| (cron) Weekly recap | Every Sunday, DMs or posts (per `GuildSettings`) a summary embed: tasks done, focus hours, projects shipped, XP earned. |

---

## 8. Badge Registry (starter set — extend freely, same pattern)

```ts
// badges/registry.ts
export const badgeRegistry = [
  { key: "first_project", name: "First Project", icon: "🏆", check: (s) => s.goalsCompleted >= 1 },
  { key: "streak_30", name: "30 Day Streak", icon: "🔥", check: (s) => s.bestStreak >= 30 },
  { key: "tasks_100", name: "100 Tasks", icon: "⚡", check: (s) => s.tasksCompleted >= 100 },
  { key: "ship_master", name: "Ship Master", icon: "🚀", check: (s) => s.goalsCompleted >= 10 },
];
```
Evaluated by `badgeService.evaluate(userId)` after every XP-awarding event; newly satisfied badges trigger a one-off "Badge Earned!" embed.

---

## 9. AI Coach — Implementation Notes

- Input to the model: last 7 days of todo completion rate, most productive hour-of-day (derived from `PomodoroSession.startedAt` clustering), incomplete goals nearing deadline.
- Prompt template (paraphrase, don't hardcode verbatim marketing copy):
  > "Given this user's task completion data [JSON], write a 3-sentence, encouraging productivity coaching note. Mention one concrete task they should prioritize today. Keep it under 60 words."
- Call the Anthropic Messages API (see `/mnt/skills/public/product-self-knowledge` conventions if the build agent is also wiring this to Claude directly — use the current API model string, not a hardcoded old one).
- Cache result per user for 24h in the DB (`coachCache` field or a small `CoachResponse` table) to avoid redundant calls on repeated `/coach` taps.

---

## 10. Non-Functional Requirements

- **Validation:** every modal submit and command option validated with zod before touching the DB.
- **Permissions:** `/challenge create` restricted to members with `ManageGuild`; verify with `interaction.memberPermissions`.
- **Rate limiting:** GitHub/LeetCode/Codeforces XP awards capped per day per source to prevent farming.
- **Logging:** pino structured logs for command usage, cron runs, and errors — no bare `console.log`.
- **Error handling:** every command handler wrapped in try/catch; user-facing errors are a red-embed, not a stack trace; full error logged server-side.
- **Gateway Intents:** `GuildMembers` (privileged) must be enabled in the Discord Developer Portal and requested via `GatewayIntentBits.GuildMembers` in the client constructor — required to resolve shared guilds for activity broadcasts (Section 12). Without it, broadcasts will silently find zero shared guilds.
- **Env config:** `config/env.ts` validates `DATABASE_URL`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (optional, for higher rate limits) at boot; fail fast with a clear message if missing.
- **Deployment:** `docker-compose.yml` with `bot` + `postgres` services (add `redis` only if/when Phase 2+ upgrade is adopted). Prisma migrations run on container start.

---

## 11. Phase Definitions of Done

**Phase 1 (MVP):** `/todo`, `/goal`, `/remind`, `/today` all work end-to-end with buttons/modals, ephemeral replies, correct embeds, and data persisted in Postgres via Prisma. Reminder cron actually delivers a DM or channel message at the right time in the user's timezone.

**Phase 2:** `/focus`, `/streak`, `/stats` work; completing a focus session updates streak and XP (XP awarding can be a stub returning a flat number until Phase 3 formalizes it).

**Phase 3:** XP/level formula live across all earning events; `/level` and `/badges` correct; at least the 4 starter badges function; `/habit add` + daily log panel work.

**Phase 4:** all three integrations poll correctly, award capped XP, and `/dev-stats` renders combined data without errors when 0, 1, or all 3 are linked. New activity correctly posts to a test guild's configured announce channel (Section 12), and correctly does *not* post when `broadcastEnabled` is off or no channel is configured.

**Phase 5:** `/coach` returns a real Claude-generated note (cached 24h); `/leaderboard` is guild-scoped and correct; `/challenge create` + join/complete flow works; weekly recap cron fires and posts/DMs correctly.

---

## 12. Activity Broadcast System

This is the "push commits → bot announces it in the channel" behavior implied by the original vision — it wasn't fully specified in earlier sections, so it's locked in here. **This is the channel you'll create** (e.g. `#coding-activity`): an admin runs `/settings announce-channel #coding-activity` once, and every future commit, LeetCode solve, or Codeforces submission from any linked member posts there automatically, with no further setup.

**Trigger:** `cron/githubPoller.ts`, `leetcodePoller.ts`, and `codeforcesPoller.ts` (Prompts 13-15) each detect new activity for a linked user and, after awarding XP, attempt a broadcast.

**Logic, in order:**
1. If `User.broadcastEnabled === false`, stop — no broadcast, XP still awarded.
2. Find every guild the bot shares with that user: `client.guilds.cache.filter(g => g.members.cache.has(userId))`. This requires the `GuildMembers` **privileged intent**, enabled both in code (`GatewayIntentBits.GuildMembers`) and in the Discord Developer Portal — flag this to the build agent explicitly, it's a common silent failure point.
3. For each shared guild where `GuildSettings.announceChannelId` is set, post the embed below to that channel. A guild with no channel configured gets nothing — this is the entire opt-in mechanism.

**Embed format — this is the bot's most morale-boosting, public-facing moment, so it should never be a plain text line:**
- Color: celebratory — reuse the XP gold (`#F1C40F`) or Stats green (`#2ECC71`)
- Thumbnail: the user's Discord avatar (`user.displayAvatarURL()`)
- Title: short and genuinely celebratory, source-specific — e.g. `🎉 New Commit Shipped!`, `🧠 LeetCode Solved!`, `⚔️ Codeforces Submission!`
- Description: 1-2 lines — who, what they did, and the XP earned, e.g. "**Rakshit** pushed 3 commits to `FlowPane` — **+20 XP**"
- A field or footer showing their current streak if they have one, so the channel doubles as an ambient, always-on leaderboard rather than a dry log

`services/broadcastService.ts` should take structured input, not a raw string, so every source produces a consistently-formatted embed:
```ts
broadcastService.broadcast(userId, {
  emoji: "🚀",
  title: "New Commit Shipped!",
  description: "pushed 3 commits to `FlowPane`",
  xpAwarded: 20,
});
```

**Extending later (not in scope now, just noting the hook exists):** the same mechanism — check `broadcastEnabled`, find shared guilds with an announce channel, post an embed — is the natural place to also broadcast level-ups and badge-earned events community-wide, if you want that down the line. Don't build it now; just don't design the broadcaster in a way that makes it hard to add.

---

## 13. Explicitly Out of Scope (don't let an agent wander into these)

- Cross-server data sync (each user's personal data is one global record, not per-guild — already covered, but don't let an agent add guild-scoping to Todo/Goal/Habit).
- Webhook-based GitHub integration (polling only, per Section 2).
- Any payment/premium tier — not part of this spec.
- Mobile app / web dashboard — Discord-only for this build.
