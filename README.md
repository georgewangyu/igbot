---
doc_schema: "doc-frontmatter-v1"
doc_id: "igbot/README"
doc_type: "readme"
doc_status: "active"
title: "igbot — Instagram Automation Client"
description: "Official Instagram publishing CLI for auth bootstrap, image posts, carousel posts, and video/Reel publishing."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:social-media"
  - "tool:igbot"
  - "type:readme"
---
# igbot — Instagram Automation Client

Minimal Instagram automation client for official API account checks, owned-media analytics, and publishing.
Modeled after `lbot` and `xbot`, but Instagram's access model has more setup friction:

- account/media analytics require an Instagram professional account and approved app permissions
- publishing requires an Instagram professional account and approved app permissions
- media has to be reachable at a public URL before Instagram can ingest it
- short-form videos are created as media containers, then published after processing
- carousel posts create one child container per slide, then publish a parent carousel container
- native Instagram editing surfaces like trending audio and stickers are not the first target

## Architecture

```text
igbot/
├── src/
│   ├── cli.js            # Unified CLI (auth bootstrap + publishing)
│   ├── client.js         # Instagram Graph API client
│   ├── credentials.js    # Shared credential loader (.env + private token file)
│   ├── finder.js         # Owned-account/manual/public-row outlier ranking
│   ├── manual.js         # CSV/JSON/JSONL worksheet loader
│   ├── output.js         # Table/JSON/JSONL output helpers
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

## Credentials

Set these in a private env file or local `igbot/.env`:

```env
IG_APP_ID=...
IG_APP_SECRET=...
IG_REDIRECT_URI=http://127.0.0.1:8787/callback
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

Score a manually collected Instagram public-data worksheet:

```bash
node src/cli.js score-file examples/manual-breakouts.csv \
  --max-followers 100000 \
  --min-views 50000
```

Experimentally fetch a known creator's recent public media through the Python
`instagrapi` bridge:

```bash
node src/cli.js private-login
node src/cli.js private-profile example_creator --max-results 20
```

Experimentally search Reels or hashtag Reels through the same bridge:

```bash
node src/cli.js private-search "software engineer" --max-results 30
node src/cli.js private-hashtag softwareengineer --max-results 30
```

The `private-*` commands are unofficial and intentionally experimental. They
mirror `tiktokbot`'s local Python bridge pattern: Node keeps output/scoring,
Python handles the platform-specific collection, and failures should be treated
as collector brittleness rather than official API failures.

Current bridge behavior:

- `private-profile` can fetch known public creators without private login in
  many cases.
- `private-search` and `private-hashtag` usually require
  `IG_PRIVATE_USERNAME` / `IG_PRIVATE_PASSWORD` or a saved
  `IG_PRIVATE_SESSION_FILE`; without that, Instagram may return
  `login_required`.
- Run `private-login` once after setting private credentials. It writes a
  reusable `instagrapi` session file. If a later search returns
  `login_required`, the bridge retries once with `relogin()` and refreshes the
  session file.

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
  --publish
```

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
- score manually/provider-collected public Instagram rows
- experimentally collect known-profile/search/hashtag rows via `instagrapi`
- publish image posts from public image URLs
- create and publish image carousel posts from 2-10 public image URLs
- create video/Reel media containers from public video URLs
- create image and video Story containers from public media URLs
- check media container status and publish containers

## What Is Intentionally Missing

- browser automation fallback
- reliable broad public Reel/search scraping
- local media hosting/upload helpers
- mixed image/video carousel publishing
- trending audio, stickers, effects, and other native composer features
- generic feed-reading commands

Those are possible later, but the first useful target is reliable official account telemetry and publishing for hook-testing assets that already exist as public URLs.

## Setup Notes

- `setup/OFFICIAL_API_SETUP.md` — app, OAuth, permissions, and posting setup
- `research/ACCESS_NOTES.md` — practical constraints for Instagram automation
