# Deploying to Vercel

The landing page is a static Next.js App Router site. It has no database, no
API routes and no server-side data fetching, so every route prerenders at build
time and Vercel needs no configuration beyond two environment variables.

> **Note:** this app lives in the `web/` subdirectory of the CultBot repo. That
> is the one setting Vercel cannot infer — see step 2.

## 1. Push the repo to GitHub

```bash
git push origin main
```

## 2. Import the project in Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and pick this GitHub repo.
2. **Set the Root Directory to `web`.** Click *Edit* next to Root Directory and
   choose the `web` folder. This is required — the repo root is the Discord bot,
   not the site, and Vercel will otherwise try to build the bot and fail.
3. Leave everything else alone. With the root set, Vercel detects Next.js and
   fills in the framework preset, build command (`next build`), output directory
   and install command automatically.

## 3. Set environment variables

In **Project Settings → Environment Variables**, add these for *Production*,
*Preview* and *Development*:

| Variable | Required | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_DISCORD_INVITE_URL` | Yes | The bot's OAuth2 invite URL |
| `NEXT_PUBLIC_GITHUB_URL` | Yes | The repo URL shown in the nav and footer |
| `NEXT_PUBLIC_SITE_URL` | Only with a custom domain | e.g. `https://cultbot.dev` |

Notes:

- Both `NEXT_PUBLIC_*` links fall back to `#` when unset, so the site still
  builds and renders — the buttons just don't go anywhere. Set them before
  sharing the link.
- These are baked in at **build time**, not read at runtime. After changing one,
  redeploy for it to take effect.
- `NEXT_PUBLIC_SITE_URL` is only needed once a custom domain is attached. Until
  then the site reads Vercel's own production URL automatically, which is what
  Open Graph image URLs are resolved against.

Get the invite URL from the [Discord Developer Portal](https://discord.com/developers/applications)
→ your application → **OAuth2 → URL Generator**: scopes `bot` and
`applications.commands`, then the permissions the bot needs.

## 4. Deploy

Click **Deploy**. Every later push to `main` redeploys production; every pull
request gets its own preview URL.

## Verifying the deploy

- **Favicon** — the bracket mark in the browser tab, not Vercel's triangle.
- **Link preview** — paste the URL into Discord or
  [opengraph.xyz](https://www.opengraph.xyz). You should get the 1200×630 card
  with the wordmark and headline. If it shows nothing, `NEXT_PUBLIC_SITE_URL` is
  set to a domain that doesn't serve the site.
- **Buttons** — "Add to Discord" should open the invite flow rather than jumping
  to the top of the page.

## Custom domain

**Project Settings → Domains → Add**, then point your registrar at Vercel as
instructed. Afterwards set `NEXT_PUBLIC_SITE_URL` to the new origin and redeploy
so social cards resolve against it.

## Running locally

```bash
cd web
npm install
cp .env.example .env.local   # then fill in the two URLs
npm run dev                  # http://localhost:3000
```

`npm run build` reproduces the production build exactly; `npm run lint` runs
ESLint. Unset environment variables log a single dev-only warning naming which
ones are missing.
