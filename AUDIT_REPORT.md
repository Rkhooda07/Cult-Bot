# CultBot (DevOS) — Production Readiness Audit

**Date:** 2026-07-18
**Scope:** Final launch gate. Static checks, full command regression, deep dive on the GitHub broadcast system, and production-readiness beyond individual features.
**Method:** This is a **code-level audit**. The bot was not run against live Discord/GitHub in this pass — anything requiring a live Discord gateway, real commit pushes, or a real GitHub token is called out explicitly as **NOT LIVE-VERIFIED**. Every code finding cites `file:line` and is reproducible from the source.

> **Verdict up front: NOT READY TO SHIP.** Four blockers, several majors. Details at the bottom.

---

## Summary table

| Feature area | Status | Notes |
|---|---|---|
| Build / TypeScript | ✅ Pass | `npm run build` → 0 errors |
| Secrets / env hygiene | ✅ Pass | No hardcoded secrets; `.env` gitignored and never committed |
| `console.log` usage | ✅ Pass | Zero in `src/`; only in `prisma/seed.ts` (one-off script) — acceptable |
| Command registration | ✅ Pass | All 17 command files registered; `/coach` correctly absent |
| `/todo` | ✅ Pass | Pagination, empty-state, zod validation all correct |
| `/goal` | ❌ Fail | **BLOCKER** — panel buttons carry `PLACEHOLDER` owner; every action rejected |
| `/remind` + cron | ⚠️ Issues | Cron delivery sound; dead "List" button; absolute times use server TZ, not user TZ |
| `/today` | ✅ Pass | |
| `/settings timezone` | ⚠️ Issues | Manual entry works; advertised autocomplete is unimplemented |
| `/settings broadcast/announce/board` | ⚠️ Issues | Work correctly; no command to *unset* announce channel |
| `/focus` | ✅ Pass | State machine sound; minor: completable past grace window |
| `/streak` | ✅ Pass | Timezone math correct |
| `/stats` | ✅ Pass | |
| `/level` + level-up | ⚠️ Issues | Curve correct; level-up notice only fires for focus, silent everywhere else |
| `/badges` + auto-award | ✅ Pass | Auto-award wired via `award()`; no double-award |
| `/habit` | ❌ Fail | **BLOCKER** — un-check keeps XP → infinite farm; **MAJOR** — long names overflow customId |
| `/link github` | ⚠️ Issues | No existence check; bad username silently persists |
| `/link leetcode` | ⚠️ Issues | Persists bad username but reports failure |
| `/link codeforces` | ✅ Pass | Verifies before persisting |
| `/dev-stats` | ✅ Pass | 0/1/2/3 accounts + graph render + unlinked all handled |
| `/board` | ✅ Pass | Non-owner pagination works (`public` owner); opt-out correct |
| `/leaderboard` | ⚠️ Issues | Works; "weekly" is a rolling 168h window, not a TZ-aware week boundary |
| `/challenge` | ❌ Fail | **BLOCKER** — join button owner `"0"` → everyone blocked → feature dead; completion awards no XP |
| GitHub broadcast — public | ⚠️ Issues | Public path works in code; daily cap correct for public-only |
| GitHub broadcast — private | ❌ Fail | **BLOCKER** — private detection unreachable without a public commit; shared cap not actually shared |
| Weekly recap cron | ✅ Pass | Per-user/per-guild error isolation; DM fallback |
| Graceful shutdown | ❌ Fail | No SIGINT/SIGTERM handling; Prisma never disconnected; cron handles discarded |
| Poller crash isolation | ✅ Pass | Per-user try/catch; API errors skip the user, never abort the cycle |
| Codeforces rate limiting | ⚠️ Issues | 2 unthrottled calls/user/cycle → 429s at real scale |
| Member-dependent features (broadcast/leaderboard/board/recap) | ⚠️ Issues | `guild.members.fetch()` never called → incomplete on servers above the ~50-member large threshold |
| Fresh-clone / Docker | ⚠️ Issues | Dev path documented & complete; Docker path skips the badge seed |
| Multi-guild isolation | ✅ Pass | `announceChannelId` keyed per guild; no leak (code-level) |

---

## Phase 1 — Static checks

- **Build:** `npm run build` (`tsc`) completes with **zero errors**. ✅
- **`console.log`:** Zero occurrences in `src/`. The only hits are a doc-comment in `src/utils/logger.ts` and `prisma/seed.ts` (a one-off seed script) — acceptable. ✅
- **Hardcoded secrets:** None. Every credential is read via `env.*` (validated in `src/config/env.ts`) or `process.env.*`. ✅
- **`.env` history:** `.env` is listed in `.gitignore` (line 12) and **was never committed** — `git log --all -- .env` is empty and `git ls-files` shows only `.env.example`. ✅
- **`env.ts` vs actual usage:** Validated set = `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`, `GITHUB_TOKEN`, `BOT_ICON_URL`, `AUTO_SET_AVATAR` — all consumed via `env.*`. ⚠️ **Minor:** four operational vars are read directly and **not** validated: `GUILD_ID` (deploy only), `NODE_ENV`, `LOG_LEVEL`, `DEBUG_TIMING`. These are optional/dev-only, so this is a documentation nit, not a defect.
- **Command registration:** All 17 command modules are imported in both `src/deploy-commands.ts` and `src/index.ts`; `commands` map is populated by side-effect import. **`/coach` is not registered anywhere** (its migration `20260716000000_remove_coach` also drops the cache table). ✅

---

## Full bug list

Severity: **Blocker** = launch-stopping / feature dead / exploitable · **Major** = significant broken behavior or reliability risk · **Minor** = cosmetic, edge-case, or hardening.

### Blockers

**B1 — `/goal` panel is entirely dead (buttons carry `PLACEHOLDER` owner).**
`src/commands/goal/goal.ts:62,65,67`
`renderPanel` computes the correct rows via `buildActionRowsWithUserId(userId, data)` into `finalComponents` (line 62) but then sends `components` (from `createGoalEmbed`, whose buttons hardcode `goal:add:PLACEHOLDER` etc. — see `src/embeds/goalEmbed.ts:62-106`). The router's `assertOwner` decodes `ownerId = "PLACEHOLDER"`, which never equals the clicker's ID, and replies "This isn't your panel."
**Repro:** `/goal` → click Add / Progress / Complete / Abandon / Delete / page → rejected. Every goal action is unreachable. `buildActionRowsWithUserId` and its `encode(...)` calls are dead code.
**Fix direction:** send `finalComponents` (rename/replace `components`), or move the owner-aware build into `createGoalEmbed`.

**B2 — `/challenge` join button blocks everyone → entire challenge feature dead.**
`src/commands/challenge/challenge.ts:74`
The join button is built with `encode("challenge", "join", "0", challengeId)` → `ownerId = "0"`. `assertOwner` (`src/utils/permissions.ts:33-40`) only bypasses on the literal `"public"`; `"0"` matches no real snowflake, so every click is rejected with "This isn't your panel." Join is button-only (no slash/select entry), so **nobody can join, therefore nobody can complete.** Compare `board:page` which correctly uses `"public"`.
**Repro:** post a challenge, any user clicks "Join Challenge" → rejected.
**Fix direction:** use `"public"` as the owner segment for the join button (one-line change).

**B3 — `/habit` un-check keeps the XP → unlimited XP farming (economy exploit).**
`src/services/habitService.ts:102-107` vs `117-121`
`toggleHabitToday` awards +5 XP + streak on check-off, but the un-check branch only deletes the `HabitLog` — it does **not** subtract XP or revert the streak.
**Repro:** check off a habit (+5 XP), un-check it (log deleted, XP kept), repeat. Each cycle nets +5 XP uncapped. Directly inflates XP, level, leaderboard, and badge thresholds. Live, trivially exploitable.
**Fix direction:** award only on the first check-off per day (idempotent), and/or subtract on un-check; guard against re-award for the same day.

**B4 — Private-repo activity detection is unreachable without a simultaneous public commit.**
`src/cron/githubPoller.ts:67-72`
When a poll cycle finds **no** new public commits, the loop hits `if (activity.newCommits.length === 0) { …; continue; }` and returns before ever reaching the GraphQL contribution-calendar block (line 122+). The "🔒 Private Progress!" broadcast and +10 XP therefore **only fire when the user also pushed a public commit in the same cycle**. A user working exclusively in private repos triggers nothing, and `lastContributionCount` goes stale (only updated inside that unreachable block).
**Repro (code trace):** user pushes only to a private repo → next poll: `newCommits.length === 0` → `continue` → private detection skipped. The headline private-activity feature is effectively dead for its primary use case.
**Fix direction:** run the contribution-calendar check for every linked user regardless of public-commit count (move it above the early `continue`, and baseline `lastContributionCount` on the first poll to avoid replaying the year's history).

### Major

**M1 — `/habit` long names overflow Discord's 100-char customId limit.**
`src/commands/habits/habit.ts:155-157`, `src/services/habitService.ts:8`
Step 2 embeds `encodeURIComponent(name)` in the customId `entityId` slot, but `habitNameSchema` allows names up to 100 chars. `habit:setFreq:<19-digit-id>:<encoded-name>` blows past 100 chars for names longer than ~65 chars (or fewer with spaces → `%20`). The select menu becomes unsendable; the reply throws and the user sees the generic error. The habit can never be created.
**Fix direction:** pass the name via a short entity key (persist a draft row and reference its id), or tighten the name cap well below the transport budget.

**M2 — GitHub public/private daily caps are NOT actually shared ("5 total combined" is violated).**
`src/services/githubService.ts:87-98`, `src/cron/githubPoller.ts:140-151`
`countGithubXpCommitsToday` counts `XPLog` rows whose `reason` starts with `"GitHub commit"`. Private awards are logged with reason `"GitHub private contribution"`, which **does not** match — so private awards never count against the cap. The public counter *can* still gate private (public=5 → private suppressed), but private activity consumes none of the shared allowance and can be awarded on **every** cycle as long as public commits stay under 5. On a day with 4 public commits and ongoing private work, a user can collect far more than the intended 5 combined awards.
**Fix direction:** count both reasons in `countGithubXpCommitsToday` (e.g. match a shared prefix or an explicit reason set), and increment the same counter for private awards.

**M3 — `/remind` "List" button is dead (no handler).**
`src/embeds/reminderEmbed.ts:134`
The List button uses `encode("remind","list",userId)` → key `remind:list`, but no `buttonHandlers.set("remind:list", …)` exists (only `add`, `cancel`, `page`). Ownership passes, the router finds no handler, logs a warn, and returns without acknowledging → Discord shows "This interaction failed."
**Repro:** `/remind list` → click List.

**M4 — `/settings timezone` autocomplete is advertised but unimplemented.**
`src/commands/settings/settings.ts:71`, `253-267`
The option sets `.setAutocomplete(true)`, but no `autocompleteHandlers.set("settings", …)` is registered, so suggestions never resolve. `COMMON_TIMEZONES` (31 zones) and the `settings:timezone` select handler are dead code. Manual typing still works (guarded by `isValidIANATimezone`), so it's non-fatal but the advertised UX is broken.

**M5 — Absolute reminder times are parsed in the server's timezone, not the user's.**
`src/services/reminderService.ts:47` (and similarly `src/services/goalService.ts:54`)
`chrono.parse(timeInput, DateTime.now().setZone(timezone).toJSDate())` — `setZone` doesn't change the instant, and no timezone option is passed to chrono, so "tomorrow 8am" resolves in the host zone (UTC under Docker).
**Repro:** user in `Asia/Kolkata` sets "tomorrow 8am" → reminder fires at 08:00 UTC (13:30 IST). Relative inputs ("in 2h") are unaffected.

**M6 — `/link leetcode` persists a bad username while telling the user it failed.**
`src/commands/link/link.ts:121-137`
`linkLeetcode` upserts the row **before** `fetchSolvedCount` verifies the profile. On a not-found profile the user sees "Couldn't find a public LeetCode profile…" but the link row already exists (`lastSolvedCount = 0`), so `/dev-stats` shows LeetCode as linked and the poller queries the bad handle forever. Codeforces does this correctly (verify-then-persist).

**M7 — `/link github` never verifies the username exists.**
`src/commands/link/link.ts:85`
Only regex validation runs; a typo'd username is accepted, "GitHub Linked" is shown unconditionally, and the poller silently never awards XP. Fails the "fail gracefully" bar (user believes it worked).

**M8 — Codeforces poller fires 2 unthrottled API calls per user per cycle → 429s at scale.**
`src/services/codeforcesService.ts:102-110`, `src/cron/codeforcesPoller.ts:51-53`
`fetchCodeforcesActivity` calls `user.status` then `user.info` back-to-back, and the poller loops users with no spacing. Codeforces enforces ~1 req / 2 s. With ~15-20 linked users (~30-40 requests in seconds) most cycles 429 → those users are silently skipped and never awarded. No crash, but a real reliability defect. (LeetCode is single-call and lower-risk.)

**M9 — Member-dependent features never call `guild.members.fetch()`.**
`src/services/broadcastService.ts:77-78`, `src/services/leaderboardService.ts:31`, `src/services/boardService.ts:23`, `src/services/streakService.ts:152`, `src/cron/weeklyRecap.ts:139`
All of these read `guild.members.cache`, which discord.js only auto-populates for guilds **below the ~50-member large threshold**. On larger servers the cache is empty/partial until members are explicitly fetched, so **broadcasts silently reach zero guilds, and leaderboard/board/server-streak show only cached members.** Weekly recap degrades to DM (its fallback saves it). This is the single biggest silent-scaling risk.
**Fix direction:** `await guild.members.fetch()` on ready (and/or before member-dependent reads), accepting the cache-warm cost.

**M10 — No graceful shutdown (SIGINT/SIGTERM).**
`src/index.ts`
No signal handlers, no `prisma.$disconnect()`, and every `cron.schedule(...)` return value is discarded (so tasks can't be stopped). On `docker stop` (SIGTERM) the process is killed abruptly. Prisma transactions are atomic so there's no corruption, but there's no clean drain of the connection pool or in-flight work.
**Fix direction:** register `SIGINT`/`SIGTERM` handlers that stop cron tasks (keep the handles), `await prisma.$disconnect()`, `client.destroy()`, then exit. *(Per instructions, not added here — flagged for a deliberate follow-up.)*

**M11 — Docker path never seeds badges → badges non-functional on a Docker-only deploy.**
`docker-compose.yml` (bot `command`), `README.md` "Full stack via Docker"
The bot container runs `prisma migrate deploy && node dist/index.js` — it does **not** run `npm run db:seed`. `badgeService.evaluate()` reads `Badge` rows that only the seed inserts, so on a fresh `docker-compose up` the `Badge` table is empty and **no badge can ever be awarded.** The README's Docker section says "there are no manual DB steps," omitting the seed. (The documented dev path, steps 1-7, is complete and does include the seed.)
**Fix direction:** add the seed to the container startup (or document it as a required step), and note that `npm run deploy` still needs a local Node env with `ts-node` (a devDependency the runner image omits).

**M12 — Challenge completion awards no XP/reward.**
`src/services/challengeService.ts:113-125`
`completeChallenge` only flips `completed = true`; no XP is granted despite the reward-styled success embed. Even after B2 is fixed, completing a challenge gives nothing. Flag as a product decision (defect vs. intentional).

### Minor

- **N1 — Private-activity detection false positives.** `src/cron/githubPoller.ts:135` compares `contributionsCollection.totalContributions` (which also counts public PRs, issues, and reviews) against public *commit* count, so opening a public issue/PR gets misattributed as "private progress." No data leak (embed is detail-free), but inaccurate. `src/services/githubService.ts:264`.
- **N2 — `lastContributionCount` uses a rolling 12-month total as if it were monotonic.** `totalContributions` shifts as the trailing edge drops off, so deltas can be understated or negative. Fragile baseline. `src/cron/githubPoller.ts:130-131`.
- **N3 — Failed/undeliverable reminder DMs are still marked sent (silent loss, no retry).** `src/cron/reminderPoller.ts:57-78` — the `.send().catch()` swallows the error and `markReminderSent` runs unconditionally, including when the user couldn't be fetched. No double-send though (atomic `updateMany` on `sent:false` + `isRunning` guard).
- **N4 — Level-up notification only fires for focus sessions.** `src/services/xpService.ts` returns `leveledUp`, but only `focus.ts:127-130` consumes it; todo/goal/habit completions and all pollers discard it → threshold crossings are silent.
- **N5 — `award()` read-modify-write is not atomic.** `src/services/xpService.ts:43-59` reads outside the transaction; two concurrent awards can lose an increment. Low frequency for a single-user-scoped bot.
- **N6 — Badge concurrent unique-violation aborts the whole eval pass.** `src/services/badgeService.ts:60-64,101-104` — a racing duplicate `create` throws and drops any other badges in that pass; recovered on the next XP event.
- **N7 — Modal-submit ownership guard is absent despite a comment claiming otherwise.** `src/events/interactionCreate.ts:107-127` never calls `assertOwner`. Impact low (modals reachable only by the opener; handlers use `interaction.user.id`), but the comment is misleading.
- **N8 — "Weekly" leaderboard is a rolling 168h window, not a TZ-aware week boundary.** `src/services/leaderboardService.ts:38` (`now.minus({days:7})`) labeled "This week" in `leaderboard.ts`.
- **N9 — No way to unset the announce channel.** `src/commands/settings/settings.ts` offers set-only; clearing requires deleting the channel or a DB edit. (Deleting the channel *does* suppress broadcasts — `broadcastService` fetches → null → skip.)
- **N10 — Focus session completable long past the grace window.** `src/services/focusService.ts:95-104` checks only `IN_PROGRESS`, no time bound → stale session's persisted button can still award +25 XP.
- **N11 — Empty-state after a component action destroys the panel.** todo/goal/remind complete/cancel handlers `editReply` a bare error embed with `components: []`, forcing a re-run of the slash command. Cosmetic.
- **N12 — Dead embed module.** `src/embeds/focusEmbed.ts` is entirely unused (`focus.ts` defines its own builders); it also contains a no-op `.setDisabled(false ? false : false)` at line 43.
- **N13 — LeetCode broadcast can overstate the count** ("solved N problems today" uses solves-since-last-poll, not the capped/awarded count). `src/cron/leetcodePoller.ts:101-105`. Same cosmetic overstate exists for GitHub ("pushed N commits" shows the pre-cap count when the daily cap truncated the award).
- **N14 — Contribution-graph weekday labels assume Monday-first ordering**; GitHub weeks start Sunday, so Mon/Wed/Fri labels can be off by one. `src/utils/contributionGraphRenderer.ts:26-29`. Purely cosmetic.

---

## GitHub Broadcast System (Phase 3 deep dive)

This subsystem was audited hardest per instructions. **It has the worst code health of any area** — one blocker and one major that together make the private-activity feature both unreachable and mis-capped.

### Public commit path — works in code, **NOT LIVE-VERIFIED**
- Flow (`src/cron/githubPoller.ts:58-120`): fetch commits newer than `lastCommitSha` → award +20 XP each up to the daily cap → advance the SHA → broadcast a celebratory gold embed with the user's avatar thumbnail, repo name, and "+N XP" (`src/services/broadcastService.ts:142-174`).
- **Daily cap (public-only): correct.** `remaining = 5 - alreadyAwardedToday`, `commitsToAward = min(new, remaining)`; the SHA is advanced past *all* commits seen (even capped ones) so they don't re-award tomorrow. Pushing 6 commits → 5 award XP. ✅ (code-level)
- **First poll after linking: correct** — baseline-only, does not replay history (`githubService.ts:196-199`).
- **Cosmetic overstate:** the broadcast text shows the pre-cap commit count while the XP reflects the capped count (N13).
- ⚠️ **Could not push a real commit** in this environment — the above is a code trace, not a live confirmation.

### Private activity path — **BROKEN (B4 + M2)**
- **B4 (Blocker):** the GraphQL contribution-calendar block is behind an early `continue` that fires whenever there are no new public commits (`githubPoller.ts:67-72`). Pure private work → no "🔒 Private Progress!" broadcast, no +10 XP, and `lastContributionCount` never advances. The feature only works as a side effect of a *public* commit in the same cycle.
- **M2 (Major):** even when it does fire, the +10 private award is logged as `"GitHub private contribution"`, which the cap counter (`startsWith "GitHub commit"`) ignores — so private awards don't count toward the shared 5/day limit. The "5 total combined" invariant is violated. The audit's specific test ("nearly max public, then trigger private") happens to pass because the *public* counter gates private, but the reverse (private consuming the allowance) does not hold.
- **N1/N2:** private detection misclassifies public non-commit contributions (PRs/issues/reviews) as private, and uses a rolling-year total as a monotonic baseline.
- **GraphQL call success — NOT LIVE-VERIFIED.** The code logs a specific error if the token lacks GraphQL scope (`githubService.ts:309-321`), and the source comments flag that fine-grained PATs have limited GraphQL support. **This could not be exercised with a live token in this pass.** Given B4, the private path is dead in code regardless of token status — but even after B4 is fixed, the token/scope and the account's "Include private contributions in profile" toggle must be verified live, or private detection stays silently null.
- **Detail-free requirement: met.** The private embed is `🔒 Private Progress!` / "made some private-repo progress today" — no repo name, message, or identifying detail (`githubPoller.ts:153-159`). ✅

### Suppression paths — correct in code
- **`/settings broadcast off`** sets `broadcastEnabled = false`; `broadcast()` checks it first and returns before posting, while XP has already been awarded by the caller → **XP accrues, broadcast suppressed** for both public and private. ✅ (`broadcastService.ts:59-62`)
- **Removing the announce channel** (deleting it) → `broadcastService` fetches → null → logs and skips → suppressed for both. ✅ But there is no command to *unset* it (N9).

### `/dev-stats` graph — works in code
- Renders the contribution graph only when GitHub is linked and the calendar fetch is non-null; unlinked GitHub simply omits the graph, and 0 linked accounts shows a friendly prompt (`devStats.ts:55-80`). No null-deref found. ✅ **NOT LIVE-VERIFIED** (canvas render not executed here).

---

## Phase 4 — Production-readiness checklist

- **Graceful shutdown:** ❌ **Not implemented** — see M10. Flagged, not added.
- **Discord permission failures on the announce channel:** ✅ Handled. `weeklyRecap` and `broadcast` both wrap channel fetch in `.catch(() => null)` and each guild send in its own try/catch, logging and continuing to the next guild/user. A deleted/forbidden channel does not crash the cron run.
- **Multi-guild isolation:** ✅ (code-level) `GuildSettings` is keyed by guild id, so `announceChannelId` cannot leak across servers. `boardVisible` is intentionally a per-user global flag (not per-guild), and the board filters to guild members — no cross-guild leak. **NOT LIVE-VERIFIED** (no second test guild exercised).
- **Rate limits / API errors:** ✅ for crash isolation — every poller wraps each user in try/catch, and services return `null` on non-OK/429 so the user is skipped, never aborting the cycle. ⚠️ but the **Codeforces poller will actually hit 429s at scale** (M8), silently starving users of XP.
- **Fresh-clone test:** ⚠️ The documented **dev path (README steps 1-7) is complete** (postgres → migrate → generate → seed → deploy → run). The **Docker path is incomplete** — it skips the badge seed (M11), so badges are dead on a Docker-only bring-up, and `npm run deploy` still requires a local Node env. **NOT LIVE-VERIFIED** (compose stack not brought up here).
- **Performance-pass regressions:** The performance work added `20260716125645_add_performance_indexes` and the DB-timing Prisma extension (`src/database/prisma.ts`, no-op when `DEBUG_TIMING` unset) plus the startup DB warm-up (`index.ts:60-65`). None of these introduced a functional regression visible in this audit — the timing extension is a transparent pass-through, and the warm-up query is fire-and-forget with its own catch.

---

## Before public launch (non-code, your call)

These are decisions, not tasks to auto-implement:

- **Repository visibility for the embed icon.** `BOT_ICON_URL` only resolves if it points at a **public** `raw.githubusercontent.com` path — Discord's embed fetcher can't authenticate to a private repo. If you want the footer icon, the repo (or at least the asset) must be public. Every embed renders fine without it, so this is optional; decide whether you want the repo public. The `AUTO_SET_AVATAR` one-shot avatar path is independent and works from the local asset.
- **Privacy policy / terms of service.** The bot collects user data (Discord IDs, todos, goals, habits, linked GitHub/LeetCode/Codeforces handles, activity) and broadcasts activity **across multiple servers**. Discord requires a Privacy Policy and Terms of Service link to list a bot publicly (and it's expected once you collect user data across guilds). You'll need to provide these links in the Developer Portal before public listing. *(Flagging only — not drafting legal text.)*
- **Privileged intent + member fetching.** The broadcast/leaderboard/board features depend on the **Server Members** privileged intent being enabled in the Developer Portal **and** on M9 being fixed (`guild.members.fetch()`), or they will silently under-report on any server above ~50 members.

---

## Final verdict — **NOT READY TO SHIP**

Four blockers must be resolved before launch:

1. **B1 — `/goal` panel is completely non-functional** (PLACEHOLDER-owner buttons; `finalComponents` computed but discarded).
2. **B2 — `/challenge` is completely non-functional** (join button owner `"0"` blocks everyone; and even fixed, completion awards no XP — M12).
3. **B3 — `/habit` allows unlimited XP farming** via un-check/re-check (live economy exploit that also corrupts leaderboards and badges).
4. **B4 — the private-GitHub-activity feature is dead** for its primary use case (unreachable without a simultaneous public commit), and the shared daily cap it advertises is not actually shared (M2).

Two of the four (B1, B2) are one-to-few-line fixes; B3 and B4 need small logic reworks. Beyond the blockers, **M9 (member fetching)** and **M11 (Docker seed)** will cause silent failures the moment the bot runs on a real (larger) server or a clean Docker deploy, and should be fixed before any public rollout. The majors around linking (M6/M7) and reminder timezones (M5) degrade core UX and should follow closely.

Per instructions, **no fixes were applied in this pass** — each should get its own focused commit in a deliberate follow-up.
