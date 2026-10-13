# Light Dey? 💡

**Is there light in your area? Tell your neighbours.**

Light Dey? is a phone app (it runs in the browser and installs to the home screen) where anyone in Nigeria can report, in two taps, whether electricity is on. From those reports it shows the live status of every area, how many hours of light each area really gets, and how that compares with what the area's tariff band promises.

This file is written for **you**, the owner, not for programmers. You never need to understand the code to run Light Dey?. If a step below asks you to type something, it tells you exactly what and where.

---

## 1. How the pieces fit together

```
   People's phones
         │
         ▼
   VERCEL ──────────► the website and the "brain" (the code in this folder)
         │                   │
         │                   ├──► SUPABASE: the database (places, reports, accounts)
         │                   └──► CLOUDFLARE TURNSTILE: the invisible "are you a person?" check
         ▼
   GITHUB: the safe copy of the code. When the code changes here, Vercel updates the live site by itself.
```

| Service | What it does for you | Where you log in | Cost today |
|---|---|---|---|
| **GitHub** | Keeps the code safe and records every change | github.com (account: `othdavie-max`) | Free |
| **Vercel** | Runs the live website | vercel.com (project: `light-dey`) | Free for testing. **Paid plan (about $20/month) needed once you add ads or sponsored placements** (Vercel's free plan is for non-commercial use). |
| **Supabase** | The database and accounts | supabase.com (project: `light-dey`) | Free for now. **Plan to upgrade (about $25/month) before launch**: the free plan pauses the database after a week of no use and has small limits. |
| **Cloudflare** | The invisible bot check (Turnstile) | dash.cloudflare.com | Free |
| A domain name (optional) | A nicer address than `light-dey-umber.vercel.app` | any registrar | about $12 a year for a `.com` |

**Live address:** https://light-dey-umber.vercel.app
**Your control room (admins only):** https://light-dey-umber.vercel.app/admin

---

## 2. The secrets (and the golden rule)

Your computer holds a file called `.env.local` in this folder. It contains the keys that let the code talk to Supabase and Cloudflare. The same keys are stored in Vercel (Project → Settings → Environment Variables).

| Key name | What it is | Is it secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your database's web address | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | A public key that is safe in people's browsers (the database rules protect your data) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **A master key to your whole database** | **YES, never share it** |
| `TURNSTILE_SECRET_KEY` | Lets your server check the bot test | **YES** |
| `IP_HASH_SALT` | A long private phrase used to scramble network addresses before storing them | **YES** |

**The golden rule:** never paste a secret key into a chat, an email, a screenshot, a public website, or the code. If one ever leaks, replace it straight away (Supabase: Project Settings → API Keys; Cloudflare: Turnstile → your widget → rotate the secret) and update `.env.local` and Vercel.

The Turnstile **site key** is public by design and lives in `config/app.config.ts`.

---

## 3. Everyday jobs, step by step

### A. Open the project on your computer
1. Open the **Terminal** (in the Claude desktop app there is a Terminal tab; or press the Windows key, type `PowerShell`, press Enter).
2. Type this and press Enter (it moves into the project folder):
   ```
   cd C:\Users\honor\light-dey
   ```

### B. Run a private copy on your computer
1. In the Terminal (after step A) type `npm run dev` and press Enter.
2. Wait for "Ready", then open http://localhost:3000 in your browser.
3. To stop it, click the Terminal and press **Ctrl + C**.

> A private copy on your computer talks to your **real** database. Reports you make there are real. Use the demo tools below if you want to practise.

### C. Change words (English or Pidgin)
All the words people read are in plain text files. Open them in Notepad:

| Screen | English file | Pidgin file |
|---|---|---|
| Home screen, buttons, messages, install card | `src\i18n\en\common.json` | `src\i18n\pcm\common.json` |
| Welcome and choosing your area | `src\i18n\en\onboarding.json` | `src\i18n\pcm\onboarding.json` |
| Spot page and area page | `src\i18n\en\spot.json` | `src\i18n\pcm\spot.json` |
| My data page | `src\i18n\en\mydata.json` | `src\i18n\pcm\mydata.json` |
| Privacy Policy, Terms, How it works | `src\content\legal.ts` | (English, with a Pidgin summary at the top) |

Rules: only change the text **between the quote marks** on the right of a colon. Keep words like `{duration}` or `{time}` exactly as they are (the app fills them in). Keep the commas and quotes. Save the file, then do job **F** to publish.

### D. Change a number (limits, thresholds, timings)
Everything adjustable is in one file: `config\app.config.ts`. The most useful:

| Setting | Meaning | Now |
|---|---|---|
| `reportCooldownMinutes` | How often one person can report the same spot | 10 |
| `status.recencyHalfLifeMinutes` | A report counts half as much after this long | 60 |
| `status.windowHours` | Reports older than this stop voting | 6 |
| `status.staleAfterHours` / `unknownAfterHours` | When "last confirmed X ago" and "Unknown" appear | 3 / 12 |
| `status.flipSupportBusy` / `flipSupportQuiet` | How much weight it takes to change a busy / quiet spot | 2.5 / 0.8 |
| `status.mixedMinSupport` | Weight each side needs before "Mixed reports" shows | 1.5 |
| `rateLimits` | Most reports per hour from one account, phone or network | 30 / 30 / 60 |
| `offline` | How long a report waiting for network is kept, and how often it retries | 6 hours, 15 s |
| `legal` | **Your business name, email, address** (see the launch checklist) | placeholders |

Each line has a comment saying what it does. Change only the number. Then job **F**.

### E. Add or fix places, DisCos, band hours
The easy way is the **admin page** (job G): the **Data** tab edits DisCos, band hours (as dated rows, so history is kept) and areas. For bulk changes (adding a whole new city) edit the files in `data\seed\` (`areas.json`, `area-coords.json`, `discos.json`, `bands.json`), then in the Terminal run:
```
npm run seed
```
It adds and updates; it never duplicates and never deletes.

### F. Publish a change to the live site
Anything you change on your computer is invisible to the public until you publish it. In the Terminal (after step A):
```
git add -A
git commit -m "Describe what you changed"
git push origin main
```
Vercel notices and updates the live site in about a minute. (Easier: ask Claude "publish my changes", and it does this, runs the checks first, and tells you if something is wrong.)
To see progress: vercel.com → your project → Deployments. A green "Ready" means it is live. If it shows an error, nothing broke: the old version stays live until a new one succeeds.

### G. Use the admin page
1. **First time only,** make an email address an admin. Use an email that can receive mail from Supabase (see "Known limits" below). In the Terminal:
   ```
   npm run make-admin -- you@example.com
   ```
2. Open https://light-dey-umber.vercel.app/admin, type that email, press the button, and open the link in the email you receive.
3. What you can do there:
   - **Overview:** reporters and reports per day, top areas, totals, what admins did recently.
   - **Spots:** new streets and estates people added. Approve, reject, edit, or **merge duplicates** (it suggests likely duplicates).
   - **Flags:** DisCo and band details people suggested. "Looks right: keep", "Wrong: undo", or dismiss.
   - **Reporters:** the busiest reporters with warning signs (many reports in an hour, many phones, one-sided reports). Ban, unban, or reset trust. The signs are hints, not proof.
   - **Data:** DisCos, band hours, area names and coordinates.
   Everything you do is recorded (who, what, when).
4. To remove admin rights: `npm run make-admin -- you@example.com remove`.

### H. Practise with fake data
```
npm run demo:seed     adds 4 clearly-labelled "DEMO" spots with a week of fake reports
npm run demo:clear    removes ALL of it
```
Demo data lives in the live database while it exists, so people can see it. **Always run `npm run demo:clear` before real people use the app.** (The admin Overview has an "Include demo data" box if you want to see it.)

### I. Edit the database structure (rarely!)
The database structure is defined in `supabase\migrations\` (numbered files `0001` to `0009`). A new change is a new numbered file. To apply one: open Supabase → **SQL Editor** → **New query**, paste the file's contents, press **Run**. Never edit tables by hand in Supabase's table viewer: the security rules and the code depend on the structure.

---

## 4. Checking that everything is healthy

| Command | What it does | When |
|---|---|---|
| `npm test` | About 190 quick automatic checks of the logic (status calculation, hours, offline queue, rate limits, the service worker…) | Before every publish |
| `npm run lint` | Checks the code for mistakes and untidiness | Before every publish |
| `npm run test:e2e` | Builds a private test copy of the app and runs about 120 real checks against your database using throwaway users (all cleaned up afterwards), including security checks. Takes a few minutes. Needs nothing else running on port 3000. | Before bigger changes and before launch |
| `npm run launch-check` | A pre-launch checklist that tests real things: placeholders left in the legal text, demo data, whether an admin exists, **whether bot protection is really on** | Before launch, and after any setting change |

---

## 5. Launch checklist

Run `npm run launch-check` and clear every **BLOCKER**. In plain words:

1. **Fill in your business details** in `config\app.config.ts` (`legal` section): business name, contact email, address, and Lagos or Abuja for disputes. They appear on the Privacy and Terms pages.
2. **Have a Nigerian lawyer read** the Privacy Policy and Terms (they are careful drafts, not legal advice). Ask them about registering with the **NDPC** (Nigeria Data Protection Commission) if you handle enough people's data to count as a "data controller of major importance".
3. **Remove demo data:** `npm run demo:clear` (done once already; run it again if you ever re-create demo data).
4. **Check the band hours** (A 20, B 16, C 12, D 8, E 4 hours a day) against NERC's current order. Fix them in Admin → Data (add new dated rows).
5. **Make yourself an admin** (job G).
6. **Turn on bot protection for new accounts** in Supabase: Authentication → Attack Protection → turn on **CAPTCHA**, choose **Cloudflare Turnstile**, paste your Turnstile **secret key**. (Without this, a bot can create thousands of fake accounts. The app is already ready for it.)
7. **Supabase address settings:** Authentication → URL Configuration → set **Site URL** to `https://light-dey-umber.vercel.app` (or your own domain) and add `https://light-dey-umber.vercel.app/**` and `http://localhost:3000/**` to **Redirect URLs**. Without this, the admin sign-in link will not land on your site.
8. **Upgrade Supabase** to Pro (about $25/month) and set up a proper email sender (for example Resend) so sign-in emails reach anyone.
9. **Test on a real phone,** including airplane mode (report offline, then switch it off and watch it send).

---

## 6. When something goes wrong

| What you see | What it means and what to do |
|---|---|
| Tapping a report says "We could not confirm you are a person" | The bot check failed. Check the Turnstile **secret key** in Vercel matches Cloudflare, and that your site's address is listed under the widget's hostnames in Cloudflare. |
| The home screen shows "I dey check the light…" forever | The phone cannot reach the database. If it is only some people, check Supabase has not paused your project (free plan) and that "Allow anonymous sign-ins" is on (Authentication → Sign In / Providers). After you turn CAPTCHA on, also check the secret key you pasted there is right. |
| The admin sign-in email never arrives | Supabase's built-in email only sends to members of your Supabase team until you add a proper sender. Use a team member's email, or set up Resend. |
| Admin sign-in link opens a blank or wrong page | Redirect URLs are not set (checklist item 7). |
| After "git push" the site did not change | Open Vercel → Deployments. If the newest one says Error, click it to read why (usually a typo in a text file: check commas and quotes). |
| A text change did not show | Hard-refresh the page. The app also saves pages on phones, so a phone may need to be closed and reopened once. |
| `npm` is not recognised | Install Node.js (nodejs.org, the LTS version), then reopen the Terminal. |
| You pasted a secret somewhere public | Replace it right away (section 2). |

---

## 7. What is where (folder map)

```
light-dey/
├─ README.md                  this file
├─ .env.local                 your private keys (never share, never commit)
├─ config/app.config.ts       every limit, threshold, timing and your business details
├─ data/seed/                 places, DisCos, band hours (edit, then run: npm run seed)
├─ public/sw.js               the "works without network" helper
├─ scripts/                   helper commands (seed, demo data, make-admin, launch-check, tests)
├─ supabase/migrations/       the database structure, in order
└─ src/
   ├─ app/                    the pages (home, onboarding, spot, area, admin, privacy, terms, about, my-data)
   │  └─ api/                 the "brain": report, spot-attributes, admin, me (download/delete my data)
   ├─ components/             the building blocks of each screen (the bulb, timeline, charts…)
   ├─ content/legal.ts        the Privacy Policy, Terms and How-it-works text
   ├─ i18n/                   all the words, English and Pidgin, per screen
   └─ lib/                    the logic: status calculation, hours, trust, rate limits, offline queue…
```

---

## 8. How your people's data is protected (the short version)

- No names, phone numbers or exact locations. People are anonymous accounts with an automatic nickname.
- Network addresses and phone codes are **scrambled (hashed)** before they are stored; the originals are never kept in your database.
- The database has **row-level security on every table**: a person's phone can only read public data and edit its own. Reports, statuses and points can only be written by your server.
- Only admins (signed in by email, checked on the server every time) can use `/admin`, and every action is logged.
- People can **download** and **delete** their data on the My data page. Deleting removes the account; past reports stay in the statistics but can no longer be tied to anyone.
- Bot protection (Cloudflare Turnstile) guards reports, and new accounts once you turn CAPTCHA on.

---

## 9. Known limits (honest list)

- **Status pages are drawn on the phone, not on the server.** That keeps them live and fast, but WhatsApp/X link previews and search engines see little. A public, preview-friendly version of area pages is planned for Phase 2. (The Privacy, Terms and How-it-works pages are server-drawn and preview well.)
- **Size:** the home screen downloads about 150 KB of code (the target was about 150 KB). About 136 KB of that is the unavoidable framework floor (React and Next.js).
- **Trust scores** are neutral for everyone and are changed only by admins today. Automatic adjustment (rising when reports match neighbours) is planned.
- **Not built yet (Phase 2 and later):** Google and email sign-in for ordinary users, push notifications ("Light don come"), shareable report-card images, referrals, the map, WhatsApp alerts, Play Store app, airtime rewards.
- **Weekly stats are calculated live** from the supply history. That is fine for now; a scheduled job to precompute them comes with the Phase 3 performance work.
- **Supabase's built-in email** only delivers to your team until you add a sender such as Resend.
- **Band hours are drafts** you must verify against NERC.
- **The admin pages are English only** (they are for you and your team).

---

## 10. Words you may meet

- **DisCo**: an electricity distribution company (AEDC, Ikeja Electric…).
- **Band (A–E)**: the tariff band that promises a minimum number of supply hours a day.
- **Spot**: the smallest place people report for (a street, estate, close, or "whole area").
- **Supply session**: a stretch of time with the same status (for example "no light from 2pm to 6pm"). Hours are added up from these.
- **Deploy**: publishing a new version to the live site.
- **Migration**: one numbered change to the database structure.
- **RLS (row-level security)**: the database's own rules about who may read or change which rows.
- **Hash**: a one-way scramble. You can check a value against it but never read the original back.
- **PWA**: a website that installs like an app and keeps working with a weak network.
- **Turnstile**: Cloudflare's invisible test that tells people from bots.
- **NDPC / NDPA**: Nigeria's Data Protection Commission / Data Protection Act 2023.

---

## 11. Phases

1. **Phase 1 (this): the MVP.** Location hierarchy, onboarding, anonymous reporting with offline queue, status calculation, supply sessions, home/spot/area pages, band check, English + Pidgin, dark/light theme, installable app, admin, Privacy/Terms/About, live on Vercel.
2. **Phase 2: growth.** Sign-in, streaks/points/badges, follows and push notifications, shareable report cards, referral links, public SEO pages. (Leaderboards and badges are built.)
3. **Phase 3: map and scale.** Live map, more cities, DisCo comparisons, performance tuning, privacy-friendly analytics.
4. **Phase 4: later.** Play Store app, phone-number sign-in, WhatsApp alerts, airtime rewards, sponsored placements (clearly labelled), a data page for journalists and researchers.
