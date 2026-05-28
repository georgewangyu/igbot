# Instagram Public Discovery Notes

This note captures the practical path for Instagram competitor/outlier research
after the official owned-account API setup.

## Goal

Find public Instagram Reels where a creator overperforms their account size,
similar to `tiktokbot web-search` / `web-trending` and `youtubebot` outlier
scoring.

Useful normalized row:

```text
platform, creator, followers, url, caption, views, likes, comments, shares,
saves, posted_at, duration_seconds, source
```

Primary scoring:

```text
views_per_follower = views / followers
outlier_score = target_reel_views / creator_recent_reel_baseline_views
```

The best score is creator-baseline outlier. If only one reel is available,
fallback to views-per-follower.

## Access Reality

The official Instagram API is good for George's owned professional account, but
not broad public Reels discovery. For other creators, assume official access is
not enough unless using limited Business Discovery / hashtag surfaces through a
different approved flow.

## Source Options

### 1. Provider API Adapter

Recommended first collector.

Candidates:

- Apify `apify/instagram-reel-scraper`
- Apify profile/post/reels actors from other vendors
- Bright Data Instagram Scraper API
- Creator Tracking API or similar creator-data providers

Why:

- Returns structured JSON.
- Handles most proxy/session/CAPTCHA work outside `igbot`.
- Can collect public profile/reel rows from profile URLs, usernames, hashtag
  surfaces, audio pages, locations, and direct Reel URLs depending on provider.
- Bright Data explicitly separates profiles, posts, reels, and comments, which
  maps well to fetching follower counts and Reel view counts as separate joins.

Build shape:

```text
igbot find-provider <query-or-url> --provider apify --max-results 50
igbot provider-profile <username> --provider brightdata
igbot score-file exported-provider-rows.jsonl
```

This is the most reliable way to get `views` + `followers` at enough volume for
multiplier research.

### 2. Private API Python Bridge

Recommended experimental local collector.

Best open-source base:

- `subzeroid/instagrapi`
- optional async/server wrappers: `subzeroid/aiograpi`, `subzeroid/aiograpi-rest`
- agent-oriented reference: `paperfoot/clinstagram`

Useful `instagrapi` surfaces found locally:

- `user_info_by_username` gives profile/follower data.
- `user_medias` gives recent profile media.
- media objects expose `play_count`, `view_count`, likes, comments, timestamps.
- `hashtag_medias_reels_v1` can pull hashtag Reels.
- `explore_reels`, `reels`, and `fbsearch_reels_v2` expose discovery/search
  style surfaces.

Risk:

- Requires Instagram username/password, 2FA, or a private session.
- Can hit `challenge_required`, `login_required`, `feedback_required`, `429`,
  or proxy/IP trust failures.
- Better for low-volume internal research than a stable default.

Build shape:

```text
igbot private-search "software engineer" --backend instagrapi --max-results 30
igbot private-profile @creator --backend instagrapi --max-results 20
igbot private-hashtag softwareengineer --backend instagrapi --max-results 30
```

Implementation should mirror `tiktokbot`'s Python bridge: Node CLI/scoring,
Python collector, JSON rows over stdout.

### 3. Instaloader / yt-dlp / Browser Utilities

Useful for archive/download and profile watchlists, not primary discovery.

Open-source references:

- `instaloader/instaloader`
- `yt-dlp/yt-dlp` Instagram extractor

Instaloader is mature and can download profiles, hashtags, Reels, comments,
captions, and metadata. It is best for watchlist/profile updates and local
archives. It is weaker for search/discovery and may not expose the exact Reel
view/follower fields needed for multiplier scoring consistently.

`yt-dlp` can inspect/download direct Reel URLs, but recent issues show Instagram
metadata extraction can break or return partial data. Treat it as a direct-URL
fallback, not a research source.

### 4. Playwright / Browser Session Adapter

Possible, but lower priority than provider + `instagrapi`.

Use case:

- Open Instagram search, hashtag, audio, or Reels surfaces in a real browser
  session.
- Capture visible Reel URLs and creator handles.
- Optionally visit each profile to read follower count.
- Optionally inspect network responses for richer JSON.

Risk:

- DOM changes often.
- View counts may not be in visible markup.
- Repeated profile visits can look automated.
- A browser extension exists in the wild for showing follower count while
  scrolling Reels, which suggests the flow is possible, but it is still a
  brittle local collector.

Build shape:

```text
igbot web-reels --query "software engineer" --max-results 30 --headless false
igbot web-profile @creator --max-results 20
```

## Reddit / Field Notes

Reddit reports broadly match the technical picture:

- Free/open scrapers break quickly or get rate-limited.
- View counts for Reels are harder to extract from the visible page than likes
  or comments.
- People doing small-batch work often fall back to Instaloader/simple scripts.
- People doing scalable Reel view tracking usually look for scraper APIs,
  provider infrastructure, proxies, or custom browser/private-API collectors.

## Recommended `igbot` Build Order

1. Add a manual/provider row scorer:
   `score-file`, CSV/JSON/JSONL input, same normalized schema as `tiktokbot`.
2. Add an `instagrapi` profile bridge:
   known creator handles in, recent Reels + follower count out.
3. Add creator-baseline join:
   for each creator, fetch recent Reels/profile follower count and compute
   `outlier_score`.
4. Add logged-in `instagrapi` search/hashtag discovery:
   low-volume inspiration sweeps using private API sessions.
5. Add Apify/provider adapter only if local search/hashtag collection is too
   brittle.
6. Only then consider a Playwright adapter:
   useful as a human-in-the-loop fallback, not the default reliable collector.

## Local Smoke Test

The first `igbot` bridge pass uses the same pattern as `tiktokbot`: Node owns
CLI/scoring/output and Python owns the platform-specific collection.

Validated commands:

```bash
node src/cli.js score-file examples/manual-breakouts.csv --min-views 1000
node src/cli.js private-profile snackoverflowgeorge --max-results 5
node src/cli.js private-profile codewithcwis --max-results 5 --format json
```

`private-profile` works without a private username/password for known public
creators. Example signal: `codewithcwis` had `616` followers and a Reel with
`5,200,456` views, producing `8442.3x` views-per-follower.

Current limitation:

```bash
node src/cli.js private-search "software engineer"
node src/cli.js private-hashtag softwareengineer
```

Both currently return `login_required` without a private `instagrapi` session.
This is expected; the next step is adding a low-risk session setup path before
using search/hashtag discovery.
