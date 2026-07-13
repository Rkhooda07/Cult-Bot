# Design Specification: Team Visibility Board (/board)

## 1. Overview
This specification details the implementation of a guild-scoped team checklist visibility board (`/board`), which displays the count of open tasks and the completion percentage of server members who use the bot.

## 2. Requirements & Constraints
- **Public Shared View:** The command `/board` replies publicly. It does not reply ephemerally.
- **Guild-Scoped:** The board includes only users who are actual members of the Discord guild (server) where the command is invoked.
- **Opt-out:** Users are included by default. They can opt out via `/settings board off`, which sets `User.boardVisible` to `false` in the database.
- **Task Privacy:** Individual task titles and contents are never exposed under any circumstances; only counts of open tasks and completion rates are shown.
- **Sorting:** Entries are sorted by completion percentage descending.
- **Pagination:** Uses the `board:page:public:<pageNumber>` customId exception. Any user in the channel can click "◀ Prev" or "Next ▶" to paginate the board (8 entries per page). Ownership checks are bypassed for public pages.

## 3. Database Schema Updates
Add a new field `boardVisible` to the `User` model:
```prisma
model User {
  id           String   @id
  // ...
  boardVisible Boolean  @default(true)
}
```

## 4. UI Design & Custom Components
### /board Embed
- **Title:** `📋 Server Checklist Board`
- **Description:** A ranked list of members:
  ```
  1. **Username** — 📝 X open tasks (Y%)
  `█████░░░░░`
  ```
- **Footer:** `Page X/Y • DevOS`

### Custom ID Structure
- Custom ID: `board:page:public:<pageNumber>`
- Bypasses the ownership check in `src/utils/permissions.ts` by checking if the `ownerId` segment is `"public"`.
