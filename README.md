# Teacher AI Club

A membership website for K-12 teachers: a directory of vetted AI tools, with a free preview for everyone and the full directory behind a paid membership.

Live site: https://teacheraiclub.net

This README describes how the site is actually built and deployed today. If something here ever stops matching reality, update this file first, because it is your recovery manual when something breaks.

---

## How it works, in one paragraph

The site is a set of static HTML pages. A build script (`build.mjs`) pulls the tool data from Airtable and writes out the finished pages into a `dist` folder, plus a members-only data file the public never sees. The whole thing is deployed on Cloudflare as a single Worker: Cloudflare serves the static pages straight from its edge, and runs a small piece of code (`src/worker.js`) for the one dynamic address, `/api/premium`, which is the paywall. Memberstack handles accounts and login, Stripe handles billing, and Kit (formerly ConvertKit) runs the free email funnel.

---

## The stack at a glance

- **Pages:** plain static HTML, built by `build.mjs`
- **Content source:** Airtable (the tool directory lives there; the build reads it)
- **Hosting and deploy:** Cloudflare Worker (Workers Static Assets), auto-deployed from GitHub
- **Accounts and login:** Memberstack
- **Billing:** Stripe, through Memberstack (monthly $9.99, annual $99)
- **Paywall:** a Cloudflare Worker route at `/api/premium` (`src/premium.js`)
- **Free email funnel:** Kit (inline form and a homepage slide-in)
- **Free lead magnet:** a 25-prompt PDF served from a direct public link (`files.teacheraiclub.net`)

---

## Project structure

Key files and folders:

- `index.html` : public homepage, with a 15-tool free preview and the pricing buttons
- `directory.html` : the full members-only directory (gated)
- `newsletter.html`, `blog.html` : members-only pages (gated)
- `thank-you.html` : free-funnel landing page after someone grabs the PDF
- `build.mjs` : the build script (reads Airtable, writes `dist/`, writes the premium data file)
- `src/worker.js` : the Worker entry point (the "front door"); routes `/api/premium`, serves everything else as static files
- `src/premium.js` : the paywall logic (verifies login and paid plan, returns members-only data)
- `src/_data/premium.js` : generated at build time, holds the members-only data, bundled into the Worker, never served to browsers (and git-ignored)
- `wrangler.toml` : Cloudflare deploy config
- `dist/` : the built site (generated, git-ignored)

---

## How content updates work

The tool directory lives in **Airtable**. To change what tools appear:

1. Edit the tools in Airtable.
2. Trigger a new deploy (see Deploying below). The build reads Airtable fresh each time and rebuilds the pages.

You do not edit tool data in the HTML by hand. The build owns that.

During the build, `build.mjs` splits the data into two parts: the public preview (names and descriptions, shown to everyone) and the premium part (the full use cases and the real tool links), which is written to `src/_data/premium.js` and bundled into the Worker so it is only ever handed out after a paid login.

---

## How the paywall works (plain language)

1. A logged-in member opens the directory. The page is hidden until membership is confirmed.
2. The page reads the member's login token from Memberstack and sends it to `/api/premium`.
3. `src/premium.js` asks Memberstack to verify the token, then checks that the member holds an active paid plan.
4. If verified and paid, the server returns the premium data and the page fills in the real use cases and links. If not, the visitor is sent to the homepage pricing section.

The important security property: the premium content is never in the public page source. It only comes from the server, only after a verified paid login.

---

## The free funnel

- A free 25-prompt PDF is the lead magnet. It is delivered by a direct public link at `files.teacheraiclub.net` and inside the Kit welcome email. It is intentionally free and is not a members-only feature.
- Kit runs the email capture. The homepage has an inline signup form and a slide-in form. The slide-in shows once per visitor based on its trigger (set inside Kit, not in the code), so testing it is best done in a fresh incognito window.

---

## Settings, variables, and secrets

These are set in the Cloudflare dashboard on the Worker, under **Settings, then Variables and Secrets**. Cloudflare splits these into two lists, and the split matters:

**Build** (used only while the site is being built):
- `AIRTABLE_BASE_ID` : variable
- `AIRTABLE_TABLE` : variable
- `AIRTABLE_TOKEN` : secret

**Runtime** (what the live Worker can see while answering visitors):
- `MEMBERSTACK_SECRET_KEY` : secret. Required for the paywall. Use the `sk_live_...` key for the live site. This MUST be in the Runtime list, not Build, or the paywall returns "Server not configured."
- `MEMBERSTACK_PAID_PLAN_IDS` : optional variable. Leave it unset for now; while it is empty, any active paid plan unlocks, which is correct for launch. If you ever set it, list BOTH of your paid plan IDs (`pln_...`), comma-separated, or you risk locking out whichever plan is missing.

Reference IDs (these live in the public HTML already):
- Memberstack app: `app_cmqiwzpsl00ef0rpk7kyac0ul`
- Monthly price: `prc_teacher-ai-club-premium-monthly-zh1a0f9r` ($9.99)
- Annual price: `prc_teacher-ai-club-premium-yearly-3b5a0jlj` ($99)
- Kit inline form: `62e62281f9`
- Kit slide-in form: `3ad8f30ce6`

---

## Deploying

Deployment is automatic. **Pushing to the `main` branch publishes the site.** Cloudflare watches the repo, runs the build command (`npm run build`), and deploys the result.

The normal flow for a change:
1. Make a branch off `main`.
2. Make your edits on that branch.
3. Open a pull request and merge it into `main`.
4. Cloudflare builds and deploys automatically. Watch the Worker's Deployments area for a green "success."

There is no manual deploy step. Do not run `wrangler deploy` against this repo unless you know exactly why; the automatic build from `main` is the supported path.

### Building locally (optional)

If you want to build on your own machine to preview:

```
npm install
npm run build
```

This needs the Airtable values available as environment variables, since the build reads live from Airtable. The output lands in `dist/`.

---

## Troubleshooting (things that have actually bitten this project)

- **The paywall returns a 404 at `/api/premium`.** The Worker is serving static files only and not running the entry script. Confirm `wrangler.toml` has `main = "src/worker.js"` and an `[assets]` block with `binding = "ASSETS"`.
- **The paywall returns "Server not configured."** The `MEMBERSTACK_SECRET_KEY` is missing, or it was added to the Build list instead of the Runtime list. It must be a Runtime secret.
- **A logged-in paid member gets bounced to the homepage and the directory stays blurred.** The page is not getting the login token to the server. The pages read the token with `getMemberCookie()` (not `getMemberToken()`, which does not exist in this Memberstack version). If this breaks again, check that line in `directory.html`, `newsletter.html`, and `blog.html`.
- **The build fails with "cannot find module ./_data/premium.js".** The build did not run before the deploy. Cloudflare runs `npm run build` automatically; locally you must run it yourself first.
- **Login seems inconsistent between `www` and the bare domain.** Pick one canonical address and make sure logins and links stay on it, since login state can be tied to the exact host.

---

## Status

The two launch blockers (the paywall delivery and the homepage pricing) are resolved. Remaining items before a wide launch: add a first piece of content to the Newsletter and Blog pages (or hide those links), add analytics, and add social preview tags plus a favicon.
