# igbot — Instagram Automation Client

Minimal Instagram automation client for official API account checks, owned-media analytics, and publishing.
Modeled after `lbot` and `xbot`, but Instagram's access model has more setup friction:

- account/media analytics require an Instagram professional account and approved app permissions
- publishing requires an Instagram professional account and approved app permissions
- media has to be reachable at a public URL before Instagram can ingest it
- short-form videos are created as media containers, then published after processing
- carousel posts create one child container per slide, then publish a parent carousel container
- native Instagram editing surfaces like trending audio and stickers are not the first target

## Status

This repo is runnable and intentionally split across explicit surfaces:

- official Graph API auth, account checks, outlier ranking, and publishing
- direct anonymous public-profile metadata probes
- manual/provider row scoring for broad research
- a bounded unofficial Python bridge that is disabled by default

## Architecture

```text
igbot/
├── src/
│   ├── cli.js            # Unified CLI (auth bootstrap + publishing)
│   ├── client.js         # Instagram Graph API client
│   ├── collectorPolicy.js # Fail-closed unofficial adapter gate
│   ├── credentials.js    # Shared credential loader (.env + private token file)
│   ├── finder.js         # Owned-account/manual/public-row outlier ranking
│   ├── health.js         # Non-secret local/live capability report
│   ├── manual.js         # CSV/JSON/JSONL worksheet loader
│   ├── output.js         # Table/JSON/JSONL output helpers
│   ├── publicProbe.js    # Anonymous first-party HTTP metadata probe
│   ├── pythonBridge.js   # Experimental instagrapi bridge wrapper
│   ├── scoring.js        # Baseline and breakout scoring
│   └── oauth.js          # Authorization URL + token exchange helpers
├── python/
│   └── instagrapi_bridge.py     # Experimental private API collector
├── examples/
│   └── manual-breakouts.csv
├── setup/
│   └── OFFICIAL_API_SETUP.md  # Durable setup note for Meta app + OAuth
├── research/
│   └── ACCESS_NOTES.md   # Practical notes on read/write constraints
├── README.md
└── .env.example
```

## Installation

```bash
npm install
```

For experimental local public-discovery collectors:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Validation

```bash
npm run env
npm test
.venv/bin/python -m unittest discover -s python -p 'test_*.py'
```

## Credentials

Set these in a private env file or local `igbot/.env`:

```env
IG_APP_ID=...
IG_APP_SECRET=...
IG_REDIRECT_URI=https://snackoverflowgeorge.com/oauth/instagram/callback
IG_ACCESS_TOKEN=...
IG_USER_ID=...
IG_GRAPH_BASE_URL=https://graph.instagram.com
IG_GRAPH_VERSION=v25.0

# Optional experimental instagrapi bridge:
IG_PRIVATE_USERNAME=...
IG_PRIVATE_PASSWORD=...
IG_PRIVATE_SESSION_FILE=.cache/instagrapi-session.json
IG_PYTHON_BIN=.venv/bin/python
```

Notes:

- `IG_ACCESS_TOKEN` should belong to the Instagram account you want to publish to
- `IG_USER_ID` is returned by `exchange-code`; `igbot me` can verify the resolved account
- `IG_GRAPH_BASE_URL` defaults to `https://graph.instagram.com`; set it to `https://graph.facebook.com` only if your Meta app flow uses the older Facebook-login Graph path
- `IG_GRAPH_VERSION` defaults to `v25.0`; change this if Meta's current app version differs
- Saved OAuth exchanges and explicit refreshes record non-secret token update
  and expiry timestamps for local health reporting.

## Usage

Generate an auth URL:

```bash
node src/cli.js auth-url
```

Run the guided OAuth flow and save the returned token:

```bash
node src/cli.js oauth-login
```

Or exchange the authorization code manually:

```bash
node src/cli.js exchange-code '<code-from-callback>' --long-lived --save
```

Inspect the authenticated Instagram account:

```bash
node src/cli.js account
```

Fetch recent owned media:

```bash
node src/cli.js my-media --max-results 30 --include-insights
```

Rank owned media against the account baseline:

```bash
node src/cli.js my-outliers --max-results 60 --min-outlier 2
```

Daily check:

```bash
node src/cli.js check
```

Token maintenance policy:

- Run `health` daily and refresh the saved long-lived token while it is still
  valid when fewer than 14 days remain. The early threshold protects against a
  missed scheduled run before the approximate 60-day boundary.
- `health`, `health --live`, and `check` never refresh or rewrite credentials.
  Credential maintenance is a separate bounded
  `node src/cli.js refresh-token --save` step.
- If refresh returns Meta code `190` or reports an expired/revoked token, stop
  retrying and run a fresh OAuth flow. Browser login alone does not authorize
  IGBot.
- OAuth callback codes are one-time secrets. Exchange them with the exact same
  redirect URI used to request the code, and never put the code or full
  callback URL in logs or durable reports.

Report local capability state without network, refresh, login, or writes. Add
`--live` for one read-only official `/me` GET; it still never refreshes or
rewrites credentials:

```bash
node src/cli.js health
node src/cli.js health --live
```

Probe a known public profile or post with anonymous direct HTTP:

```bash
node src/cli.js public-profile example_creator
```

Score a manually collected Instagram public-data worksheet:

```bash
node src/cli.js score-file examples/manual-breakouts.csv \
  --max-followers 100000 \
  --min-views 50000
```

Experimentally fetch a known creator's recent public media through the Python
`instagrapi` bridge:

```bash
node src/cli.js private-profile example_creator \
  --enable-unofficial-adapter \
  --max-results 20
```

Experimentally search Reels or hashtag Reels through the same bridge:

```bash
node src/cli.js private-search "software engineer" --enable-unofficial-adapter --max-results 30
node src/cli.js private-hashtag softwareengineer --enable-unofficial-adapter --max-results 30
```

The `private-*` commands are unofficial and intentionally experimental. They
mirror `tiktokbot`'s local Python bridge pattern: Node keeps output/scoring,
Python handles the platform-specific collection, and failures should be treated
as collector brittleness rather than official API failures.

Current fail-closed bridge behavior:

- Every collector requires `--enable-unofficial-adapter` and starts anonymous.
- `private-profile` can fetch known public creators anonymously in some cases.
- `private-search` and `private-hashtag` usually require
  a saved `IG_PRIVATE_SESSION_FILE`; select it explicitly with
  `--use-private-session`.
- Collector commands never log in, retry with credentials, or rewrite a
  session. `login_required` is a visible blocker.
- `private-login --confirm-login` is the only bridge command allowed to log in
  and write the session file. Run it only as a separate approved action.

Publish an image post from a public image URL:

```bash
node src/cli.js image 'https://example.com/post.png' --caption 'hello from igbot'
```

Create an image carousel container from public image URLs:

```bash
node src/cli.js carousel \
  'https://example.com/slide-1.png' \
  'https://example.com/slide-2.png' \
  'https://example.com/slide-3.png' \
  --caption 'hello from an igbot carousel'
```

Create and publish an image carousel after container processing:

```bash
node src/cli.js carousel \
  'https://example.com/slide-1.png' \
  'https://example.com/slide-2.png' \
  --caption 'hello from an igbot carousel' \
  --poll-interval 60 \
  --timeout 900 \
  --publish
```

Create a mixed image/video carousel container from public media URLs:

```bash
node src/cli.js carousel-media \
  'image:https://example.com/slide-1.png' \
  'video:https://example.com/slide-2.mp4' \
  'image:https://example.com/slide-3.png' \
  --caption 'hello from an igbot mixed-media carousel'
```

Create and publish a mixed image/video carousel after container processing:

```bash
node src/cli.js carousel-media \
  'video:https://example.com/slide-1.mp4' \
  'video:https://example.com/slide-2.mp4' \
  --caption 'hello from an igbot video carousel' \
  --poll-interval 60 \
  --timeout 1200 \
  --publish
```

For motion carousels, use `carousel-media` with `video:<url>` children. The
plain `carousel` command publishes image children only, so it will always be
static even if matching MP4 files exist locally.

Practical video-carousel defaults:

- use direct-public HTTPS URLs, not browser-gated previews
- prefer MP4 files that return `HEAD 200`
- encode H.264, yuv420p, faststart
- use at least `4s` duration for short loops
- include silent AAC audio if the source loop is otherwise video-only
- use slow polling: `--poll-interval 60 --timeout 1200`

Add per-slide accessibility alt text with `||` separators:

```bash
node src/cli.js carousel \
  'https://example.com/slide-1.png' \
  'https://example.com/slide-2.png' \
  --caption 'hello from an igbot carousel' \
  --alt-texts 'Alt text for slide one||Alt text for slide two'
```

Create a Reel/video container:

```bash
node src/cli.js video 'https://example.com/reel.mp4' --caption 'hello from igbot'
```

Check container status:

```bash
node src/cli.js status <creation_id>
```

Publish a ready container:

```bash
node src/cli.js publish <creation_id>
```

Create and immediately publish a Reel/video container:

```bash
node src/cli.js video 'https://example.com/reel.mp4' --caption 'hello from igbot' --publish
```

Create an image Story container:

```bash
node src/cli.js story-image 'https://example.com/story.png'
node src/cli.js status <creation_id>
node src/cli.js publish <creation_id>
```

Create a video Story container:

```bash
node src/cli.js story-video 'https://example.com/story.mp4'
node src/cli.js status <creation_id>
node src/cli.js publish <creation_id>
```

Show resolved config state:

```bash
node src/cli.js env
```

## What Works Today

- build Instagram OAuth authorization URLs
- exchange auth codes for short-lived or long-lived tokens
- run a guided OAuth login and save tokens to a private env file
- refresh long-lived tokens
- inspect token-backed Instagram identity through `/me`
- inspect the authenticated professional account profile
- fetch recent owned media
- optionally fetch per-media insights when the token has permission
- rank owned media against the account's recent baseline
- report non-secret local and read-only live capability health
- probe known public profiles through anonymous first-party HTTP
- score manually/provider-collected public Instagram rows
- explicitly opt into experimental known-profile/search/hashtag collection via
  `instagrapi` without automatic login or session rewrites
- publish image posts from public image URLs
- create and publish image carousel posts from 2-10 public image URLs
- create and publish mixed image/video carousel posts from 2-10 public media URLs
- create video/Reel media containers from public video URLs
- create image and video Story containers from public media URLs
- check media container status and publish containers

## What Is Intentionally Missing

- browser automation fallback
- reliable broad public Reel/search scraping
- local media hosting/upload helpers
- trending audio, stickers, effects, and other native composer features
- generic feed-reading commands

Those are possible later, but the first useful target is reliable official account telemetry and publishing for hook-testing assets that already exist as public URLs.

## Setup Notes

- `setup/OFFICIAL_API_SETUP.md` — app, OAuth, permissions, and posting setup
- `setup/MEDIA_HOSTING_SETUP.md` — public URL hosting pattern for local images,
  videos, and motion carousel pages
- `research/ACCESS_NOTES.md` — practical constraints for Instagram automation

## Goals

- Keep official publishing and owned-account inspection dependable.
- Preserve enough public-data experimentation to support breakout scouting.
- Make media-ingest and permission constraints obvious to the operator.

## Non-Goals

- pretending unofficial collectors are production-stable
- expanding into a generic agency scheduler
- hiding missing Meta permissions or token issues
