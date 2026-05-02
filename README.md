---
doc_schema: "doc-frontmatter-v1"
doc_id: "igbot/README"
doc_type: "readme"
doc_status: "active"
title: "igbot — Instagram Automation Client"
description: "Official Instagram publishing CLI for auth bootstrap, image posts, and video/Reel publishing."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:social-media"
  - "tool:igbot"
  - "type:readme"
---
# igbot — Instagram Automation Client

Minimal Instagram automation client for official API publishing.
Modeled after `lbot` and `xbot`, but Instagram's access model has more setup friction:

- publishing requires an Instagram professional account and approved app permissions
- media has to be reachable at a public URL before Instagram can ingest it
- short-form videos are created as media containers, then published after processing
- native Instagram editing surfaces like trending audio and stickers are not the first target

## Architecture

```text
igbot/
├── src/
│   ├── cli.js            # Unified CLI (auth bootstrap + publishing)
│   ├── client.js         # Instagram Graph API client
│   ├── credentials.js    # Shared credential loader (.env + private token file)
│   └── oauth.js          # Authorization URL + token exchange helpers
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

## Credentials

Set these in `georgerepo/.tokens/instagram.env` or `igbot/.env`:

```env
IG_APP_ID=...
IG_APP_SECRET=...
IG_REDIRECT_URI=http://127.0.0.1:8787/callback
IG_ACCESS_TOKEN=...
IG_USER_ID=...
IG_GRAPH_BASE_URL=https://graph.instagram.com
IG_GRAPH_VERSION=v25.0
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

Exchange the authorization code:

```bash
node src/cli.js exchange-code '<code-from-callback>' --long-lived
```

Inspect the authenticated Instagram account:

```bash
node src/cli.js me
```

Publish an image post from a public image URL:

```bash
node src/cli.js image 'https://example.com/post.png' --caption 'hello from igbot'
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

Show resolved config state:

```bash
node src/cli.js env
```

## What Works Today

- build Instagram OAuth authorization URLs
- exchange auth codes for short-lived or long-lived tokens
- refresh long-lived tokens
- inspect token-backed Instagram identity through `/me`
- publish image posts from public image URLs
- create video/Reel media containers from public video URLs
- check media container status and publish containers

## What Is Intentionally Missing

- browser automation fallback
- local media hosting/upload helpers
- carousel publishing
- Stories publishing
- trending audio, stickers, effects, and other native composer features
- generic feed-reading or scraping commands

Those are possible later, but the first useful target is reliable official publishing for hook-testing assets that already exist as public URLs.

## Setup Notes

- `setup/OFFICIAL_API_SETUP.md` — app, OAuth, permissions, and posting setup
- `research/ACCESS_NOTES.md` — practical constraints for Instagram automation
