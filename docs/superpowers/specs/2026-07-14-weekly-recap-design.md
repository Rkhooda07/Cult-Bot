# Design Spec: Timezone-Aware Weekly Recap Cron

**Date:** 2026-07-14
**Feature:** Weekly Recap Cron (`cron/weeklyRecap.ts`)
**Status:** Approved

---

## 1. Overview
Every Sunday at 20:00 (8:00 PM) local time in the user's timezone, the bot will compile a summary of their productivity statistics over the past 7 days. If the user has opted into public broadcasts (`User.broadcastEnabled === true`), this recap is announced in the configured announce channels of all guilds they share with the bot. If broadcasts are disabled, if no announce channels are configured, or if posting fails, the recap is delivered as a private Direct Message (DM).

If a user has had zero activity (no tasks completed, no focus sessions completed, no goals completed, and no XP earned) in the past 7 days, the recap is skipped to prevent spam.

---

## 2. Timing and timezone logic
- The cron job runs **hourly at the top of the hour** (`0 * * * *`).
- On each run:
  1. Retrieve all users from the database.
  2. Parse each user's current timezone-localized time using `luxon` with the user's configured timezone (fallback to UTC).
  3. Filter users where the localized day is **Sunday** (`userTime.weekday === 7`) and the hour is **20** (`userTime.hour === 20`).
  4. Perform recap compilation and delivery for the matching users.

---

## 3. Metrics Querying
For each matching user, the activity window is the past 7 days:
- `end = userTime`
- `start = userTime.minus({ days: 7 })`

The metrics are computed as follows:
1. **Tasks Completed:** Count `Todo` where `userId` matches, `done === true`, and `doneAt` is within `[start, end]`.
2. **Focus Time:** Find `PomodoroSession` where `userId` matches, `status === "COMPLETED"`, and `completedAt` is within `[start, end]`. Sum `durationMin` and convert to hours (`durationMin / 60` formatted to 1 decimal place). Also count the total number of completed focus sessions.
3. **Goals Completed:** Count `Goal` where `userId` matches, `status === "COMPLETED"`, and `completedAt` is within `[start, end]`.
4. **XP Earned:** Sum `amount` from `XPLog` where `userId` matches and `createdAt` is within `[start, end]`.

---

## 4. Delivery Flow
1. Fetch `User.broadcastEnabled`.
2. If `broadcastEnabled` is `false`, send via DM.
3. If `broadcastEnabled` is `true`:
   - Resolve shared guilds using `client.guilds.cache.filter(g => g.members.cache.has(userId))`.
   - Query `GuildSettings` for each shared guild to check if `announceChannelId` is set.
   - For each configured channel, attempt to post the recap embed.
   - Keep track of whether at least one announcement was posted successfully.
   - If no announcements were posted successfully (or no announce channels are configured), fall back to DM.

---

## 5. Embed Design
- **Color:** `0x2ecc71` (Stats Green)
- **Title:** `📈 Weekly Productivity Recap`
- **Thumbnail:** The user's Discord avatar.
- **Fields:**
  - `📝 Tasks Completed`: `X tasks`
  - `🍅 Focus Time`: `X hours (Y sessions completed)`
  - `🎯 Goals Finished`: `X goals`
  - `🏆 XP Earned`: `X XP`
- **Footer:** `CultBot`
- **Timestamp:** Current time.
