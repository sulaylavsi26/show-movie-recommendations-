# What Should We Watch? — Sulay & Tanya's Recommendation Agent

A personal movie and television recommendation system for Sulay and Tanya.
Its job is not to produce generic lists, but to quickly identify what they are
genuinely likely to enjoy and prevent wasted browsing time.

## Repository contents

| File | Purpose |
|------|---------|
| [`agent-instructions.md`](agent-instructions.md) | The full behaviour brief: viewer profile, hard rules, scoring method, and response format. |
| [`lists/watched-liked.md`](lists/watched-liked.md) | Titles they have watched and enjoyed. Never re-recommended. |
| [`lists/watched-disliked.md`](lists/watched-disliked.md) | Titles they watched and did not enjoy. Never re-recommended. |
| [`lists/watchlist.md`](lists/watchlist.md) | Verified candidates queued to watch next. |

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
