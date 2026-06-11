# Teacher AI Club — site + Airtable build

This is your website (`index.html`) plus a small build step (`build.mjs`) that pulls
your tool directory **from Airtable at build time** and writes a fast, static site
into `dist/`. Cloudflare Pages serves that folder.

**Why build-time?** Your Airtable token stays on the server and never reaches a
visitor's browser, the site loads instantly (no live API calls), and the **free
build automatically leaves out the premium Use Case text** — it ships only the
*number* of use cases per tool, so the premium content can't be scraped from the page.

```
Airtable (your data)  →  build.mjs  →  dist/index.html  →  Cloudflare Pages
```

---

## What's in here

| File | What it does |
|------|--------------|
| `index.html` | The site. Contains sample tools between `/*__TOOLS_START__*/` and `/*__TOOLS_END__*/` — the build replaces them with live Airtable data. |
| `build.mjs` | Fetches Airtable and injects the data. No dependencies to install. |
| `package.json` | Defines the `build` command. |
| `.env.example` | The environment variables you need (copy to `.env` for local testing). |
| `.gitignore` | Keeps your `.env` secret and `dist/` out of git. |

---

## Getting your Airtable token & base ID

Airtable no longer uses "API keys" — you create a **Personal Access Token (PAT)**.

1. Go to **airtable.com**, click your **profile icon** (top right) → **Developer hub**
   (labeled **Builder hub** in some accounts).
2. Open **Personal access tokens** → **Create new token**.
3. **Name** it (e.g. "Teacher AI Club site").
4. **Scopes:** add **`data.records:read`**. (That's all the site needs.)
5. **Access:** add your tools **base**.
6. Click **Create token** and **copy it immediately** — Airtable shows the full token
   only once. It starts with `pat...`. This is your `AIRTABLE_TOKEN`.

**Base ID:** go to **airtable.com/api**, click your base — the ID shown (and in the
page URL) starts with `app...`. That's your `AIRTABLE_BASE_ID`.

> Your **table name** must match Airtable exactly (case-sensitive). Default is `Tools` —
> change `AIRTABLE_TABLE` if yours differs.

---

## Test it locally (optional but recommended)

You'll need **Node 18 or newer** (`node -v` to check).

1. Copy `.env.example` to `.env` and fill in your token, base ID, and table name.
2. Run:
   ```bash
   npm run build
   ```
3. Open `dist/index.html` in your browser. You should see your real tools.

If you see `Airtable 401` → token is wrong or missing the `data.records:read` scope, or
the base isn't added to the token. If you see `Airtable 404` → the table name doesn't
match (check spelling/capitalization).

---

## Put it on GitHub

1. Create a new repository.
2. Add these files to it (the whole folder) and push.
   `dist/` and `.env` are git-ignored on purpose — never commit your token.

---

## Deploy on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** →
   **Connect to Git** → pick your repo.
2. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Environment variables** (under the same setup screen, or Settings →
   Environment variables afterward): add
   - `AIRTABLE_TOKEN`
   - `AIRTABLE_BASE_ID`
   - `AIRTABLE_TABLE`
   - `AIRTABLE_VIEW` (optional)
4. **Save and Deploy.** Cloudflare runs the build, fetches Airtable, and publishes.
   Every `git push` re-deploys automatically.

To attach **TeacherAIClub.net**, see the custom-domain steps we covered (move the
domain's nameservers to Cloudflare, then add it under the project's Custom domains).

---

## Refresh the site when you add tools (monthly)

Because the data is pulled at build time, the site updates when it **rebuilds**.
Set up a one-click rebuild:

1. Cloudflare Pages project → **Settings → Builds & deployments → Deploy hooks**.
2. **Create deploy hook**, name it (e.g. "Airtable refresh"), pick your branch.
3. Copy the URL it gives you. Opening that URL (or sending it a POST request)
   triggers a fresh build that re-pulls Airtable.

Keep that link as a browser bookmark and click it after you add tools — or automate it
(e.g. an Airtable automation or a monthly scheduled job that calls the URL).

---

## Field mapping (Airtable → site)

| Airtable column | Used as |
|-----------------|---------|
| Tool Name | Card title |
| Description | Card description |
| Tool Type | Category label + auto icon/color + Tool Type filter |
| Grade Level | Grade tags + Grade filter + hero tiles |
| Tags | Tag chips + Tags filter |
| URL | "Visit tool" link |
| Use Case 1 / 2 / 3 | Counted only → the locked "Premium" teaser (text stays in Airtable) |

To change a column name, edit the `FIELD` map at the top of `build.mjs`.

`Grade Level` and `Tags` can be either multi-select fields or comma-separated text —
the build handles both.

---

## Premium delivery (reminder)

This site is the **free** tier. Premium = the full Use Case content + advanced filtering,
delivered through a **gated Airtable view** (share link after Stripe checkout) for the
lean launch, or a **Softr / Noloco** member portal later. The premium text is never
included in this build, so it stays genuinely behind the paywall.
