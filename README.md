# What Should We Watch? — Sulay & Tanya's Recommendation Agent

A personal movie and television recommendation system for Sulay and Tanya.
Its job is not to produce generic lists, but to quickly identify what they are
genuinely likely to enjoy and prevent wasted browsing time.

## Repository contents

| File | Purpose |
|------|---------|
| [`public/index.html`](public/index.html) | The interactive web app — pick a mood, get three scored picks and a verdict. Self-contained; works offline with curated data. |
| [`worker.js`](worker.js) | Cloudflare Worker entry — serves the app and the `/api/verify` endpoint. |
| [`src/verify.js`](src/verify.js) | Live-data logic: TMDb (India availability + IMDb id) and OMDb (IMDb + RT critics). |
| [`wrangler.jsonc`](wrangler.jsonc) | Worker + static-assets config for `wrangler deploy`. |
| [`agent-instructions.md`](agent-instructions.md) | The full behaviour brief: viewer profile, hard rules, scoring method, and response format. |
| [`lists/watched-liked.md`](lists/watched-liked.md) | Titles they have watched and enjoyed. Never re-recommended. |
| [`lists/watched-disliked.md`](lists/watched-disliked.md) | Titles they watched and did not enjoy. Never re-recommended. |
| [`lists/watchlist.md`](lists/watchlist.md) | Verified candidates queued to watch next. |

## Deploying (Cloudflare Workers)

The repo is wired for the Cloudflare Workers build flow:

- **Build command:** _(none)_
- **Deploy command:** `npx wrangler deploy`

The app is served from `public/`; the Worker answers `/api/verify`. Two keys
must be set in the Cloudflare dashboard as **environment variables** (never in
git): `TMDB_API_KEY` and `OMDB_API_KEY`. On each request the Worker calls TMDb
for current India availability and OMDb for the live IMDb + Rotten Tomatoes
critics scores; each card's status pill turns green ("● Live") when verified. If
a key is missing or a lookup fails, the card silently falls back to its curated
value and the pill reads "Curated". The RT **audience** score has no free live
source, so it stays indicative (marked ≈).

Pushes to a non-production branch produce a **preview** deployment; promote by
setting this branch as the production branch, or merge into the default branch.

## How the lists evolve

- When they say **"we watched it,"** the title moves to `watched-liked` or
  `watched-disliked` along with Sulay's and Tanya's scores out of 10 and one
  short reason from each.
- New recommendations that survive verification can be parked in `watchlist`.
- Nothing in `watched-liked` or `watched-disliked` is ever recommended again.

## Session quick-start

Every session opens with a compact five-question menu (format, mood,
commitment, energy, language). Shortcuts:

- **"roulette"** — pick movie or show, then three verified options with one winner.
- **"emergency recommendation"** — no questions; three verified options now.
- **"not feeling it"** — replace the current recommendations without defending them.

Availability and scores (IMDb, Rotten Tomatoes critics + audience) are verified
against current web sources immediately before every recommendation — never
from memory.
