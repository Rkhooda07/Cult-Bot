# CultBot — Claude Operating Manual

## Developer Brain

Developer Brain lives at: `/Users/rkhooda/Documents/Rkxee Obsidian/Developer's brain`

At the start of every session, read in this order:

1. `Developer Brain/CLAUDE.md` — governing operating principles
2. `Developer Brain/ARCHITECTURE.md` — zone structure and content boundaries
3. `Developer Brain/projects/cultbot/overview.md` — project context in Developer Brain

The principles in Developer Brain govern every session in this repository — read-before-acting, improve-don't-duplicate, quality over quantity, no speculative files, no AI attribution in commits. Do not duplicate them here. If anything here conflicts with Developer Brain, follow Developer Brain and flag the conflict.

Never depend on prior chat history to recover context. Always reconstruct it from this file, `README.md`, `docs/discord-bot-implementation-spec.md`, and the Developer Brain project overview.

---

## Project

**Name:** `cultbot`
*Matches the folder at `Developer Brain/projects/cultbot/`.*

**What it is:** CultBot — a Discord bot that turns a server into a developer productivity operating system: todos, goals, reminders, focus sessions, streaks, XP, habits, GitHub/LeetCode/Codeforces integrations, an AI coach, and guild leaderboards — driven entirely by buttons, select menus, and modals instead of typed sub-commands.

**Stack:** TypeScript (strict), discord.js v14, Prisma + PostgreSQL, node-cron, zod, luxon, chrono-node, pino, NVIDIA NIM (Nemotron) for the AI coach, `@napi-rs/canvas` for rendered contribution graphs. Dockerized (bot + postgres).

**Source of truth for design decisions:** `docs/discord-bot-implementation-spec.md` locks the non-negotiable design principles (buttons/modals over typed commands, per-user global data vs. per-guild social data, customId ownership convention, embed color/emoji system, phase sequencing). Do not deviate from a locked decision without flagging it first. Phases 1–5 are complete; features built since (`/board` team visibility, rendered GitHub contribution graphs, weekly recap) extend the same conventions.

---

## Session Startup Protocol

Every new session should, without being asked:

1. Read this file.
2. Read `README.md` for current features and project structure.
3. Skim recent `git log` to see what shipped most recently.
4. Read `Developer Brain/projects/cultbot/overview.md` for the "why" behind the architecture.
5. Read `docs/discord-bot-implementation-spec.md` (or the relevant section) when a task touches a locked design decision.
6. Continue from the current repository state — do not ask the user to re-explain the workflow described here.

---

## Repository Documentation Workflow

This repository owns *context*: what the codebase does, how to run it, and decisions specific to its own constraints. Developer Brain owns *knowledge*: engineering principles this project revealed that generalize beyond it.

- `README.md` — what the project is, setup, features, conventions. Keep current when features or setup steps change.
- `CLAUDE.md` (this file) — session protocol and repo-specific rules. Update when the workflow itself changes, not for feature work.
- `docs/discord-bot-implementation-spec.md` — the locked spec. Treat as historical/authoritative for Phase 1–5 decisions; do not rewrite it to match later ad hoc features. If a locked decision is deliberately superseded, note the change near the relevant section rather than silently editing history.
- `docs/superpowers/specs/` — per-feature design specs for work built after the original spec (e.g. team visibility board, weekly recap). Add one here when a new feature has non-obvious design decisions worth recording; skip it for straightforward additions.

Do not create new documentation files for completeness. Only add a doc when it captures something a reader (including future-you) could not recover from the code in a few minutes.

---

## Living Project Memory

Architecture evolution, implementation progress, and technical debt for *this* project stay in this repository (README, docs/, git history) — never in Developer Brain. Developer Brain's `projects/cultbot/overview.md` holds only the stable why-context (constraints, stack rationale, current status), updated at milestones, not per-commit.

---

## Knowledge Promotion Workflow

At the end of a significant session or milestone, ask: **would this be useful on a different project, stack, or team?**

- If yes, and it passes all four tests in `Developer Brain/WORKFLOW.md#Promotion Criteria` (reusability, insight, clarity, uniqueness) — promote it to `Developer Brain/knowledge/` (timeless concept) or `Developer Brain/playbook/` (personal practice). Link back to `Developer Brain/projects/cultbot/overview.md`.
- If no — keep it here. Examples that stay local: this bot's Prisma schema, its customId scheme, its specific cron cadence, discord.js quirks handled inline.
- Examples of what *has* generalized from bot-building work in general: interaction-router patterns for stateful UI, polling-vs-webhook tradeoffs, declarative rule-registry patterns (badges). Only promote once actually proven here, not speculatively.

When in doubt, wait. Do not promote mid-session.

---

## Git Workflow

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`), matching the existing history in this repo.
- Focused commits — one logical change per commit. Separate documentation-only commits from implementation commits when practical.
- Never vague messages ("updates", "fixes"). Name the domain and the change.
- No Claude/Anthropic/AI/Co-Authored-By/Generated-by attribution in commit messages unless explicitly asked.
- Review the full diff before committing.

---

## Engineering Quality Expectations

- Buttons/select menus/modals only — never a second typed sub-command inside a domain flow (Design Principle 2 in the spec).
- Every reply is an embed; no bare-string replies.
- Every modal submit and command option validated with zod before touching the DB.
- Structured `pino` logging, not `console.log`.
- Every command handler wrapped in try/catch; user-facing errors are a red embed, internal errors logged server-side.
- `customId` format `domain:action:ownerId:entityId`, ownership verified before dispatch.
- Personal data (todos, goals, habits) is per-user and ephemeral; social data (leaderboard, board, challenges, broadcasts) is per-guild and public, subject to opt-in/opt-out settings.

---

## Repository Maintenance Rules

- Keep `README.md`'s feature list, setup steps, and project structure diagram in sync with what's actually shipped.
- When a locked spec decision is superseded, say so explicitly near the decision rather than quietly rewriting the spec.
- Prune `docs/superpowers/specs/` entries only if the feature they describe is removed — otherwise they're the durable record of why a non-obvious feature was built the way it was.
- Apply the same "does this justify its existence" bar Developer Brain applies to its own notes.

---

## Session End

At the end of any significant session:

1. Did architecture change, or did a feature ship? → Update `README.md` (and `docs/superpowers/specs/` if the feature had non-obvious design decisions).
2. Was a locked spec decision changed or superseded? → Note it in `docs/discord-bot-implementation-spec.md` near the relevant section.
3. Has the project's overall state changed meaningfully (new phase, new integration, status change)? → Update `Developer Brain/projects/cultbot/overview.md`.
4. Does anything from this session pass Developer Brain's promotion criteria? → Promote it per the Knowledge Promotion Workflow above.
5. Give a short summary: what changed, docs updated, Developer Brain updates (if any), architecture/decisions (if any), recommended next milestone.

Do not over-document. Only update what genuinely needs to evolve.
