# Instagram Official API Setup

This repo uses the official Instagram Graph/Platform publishing path. It does not use browser automation.

## Prerequisites

- Instagram professional account for the product or founder account.
- Meta developer app with Instagram API access.
- Publishing permission for the app, typically `instagram_business_content_publish`.
- Basic profile permission, typically `instagram_business_basic`.
- Insights permission for richer account checks, typically `instagram_business_manage_insights`.
- Comment permission if comment-management commands are added later, typically `instagram_business_manage_comments`.
- A valid OAuth redirect URI, for example `http://127.0.0.1:8787/callback`.

Meta changes product naming and review flow often. If the app dashboard offers both older Facebook-login-based Instagram Graph API setup and newer Instagram Login/API setup, prefer the flow that grants the `instagram_business_*` scopes for the account being tested.

## Environment

Create a private env file or local `igbot/.env`:

```env
IG_APP_ID=...
IG_APP_SECRET=...
IG_REDIRECT_URI=http://127.0.0.1:8787/callback
IG_ACCESS_TOKEN=
IG_USER_ID=
IG_GRAPH_BASE_URL=https://graph.instagram.com
IG_GRAPH_VERSION=v25.0
```

## OAuth Flow

Run the guided flow:

```bash
node src/cli.js oauth-login
```

This prints the authorization URL, accepts the callback URL or `code`, exchanges it for a token, upgrades it to a long-lived token by default, and saves `IG_ACCESS_TOKEN` / `IG_USER_ID`.

Alternatively, generate an authorization URL:

```bash
node src/cli.js auth-url
```

Open the URL, approve the app, and copy the `code` from the redirect URI.

Exchange the code manually:

```bash
node src/cli.js exchange-code '<code-from-callback>' --long-lived --save
```

Add the returned values to the token file:

```env
IG_ACCESS_TOKEN=...
IG_USER_ID=...
```

Then verify:

```bash
node src/cli.js me
node src/cli.js account
node src/cli.js my-media --max-results 10
node src/cli.js check
```

If insights permission is approved, use:

```bash
node src/cli.js my-media --max-results 30 --include-insights
node src/cli.js my-outliers --max-results 60 --min-outlier 2
```

## Publishing Flow

Instagram publishing is container based:

1. Create a media container from a public image or video URL.
2. For carousel posts, create one child container per slide, then create a parent carousel container.
3. For videos/Reels and carousel posts, wait until processing is complete.
4. Publish the container.

Image post:

```bash
node src/cli.js image 'https://example.com/post.png' --caption 'hello from igbot'
```

Image carousel:

```bash
node src/cli.js carousel \
  'https://example.com/slide-1.png' \
  'https://example.com/slide-2.png' \
  'https://example.com/slide-3.png' \
  --caption 'hello from igbot'
node src/cli.js status <creation_id>
node src/cli.js publish <creation_id>
```

Create and immediately publish after the child and parent containers are ready:

```bash
node src/cli.js carousel \
  'https://example.com/slide-1.png' \
  'https://example.com/slide-2.png' \
  --caption 'hello from igbot' \
  --publish
```

Video/Reel:

```bash
node src/cli.js video 'https://example.com/reel.mp4' --caption 'hello from igbot'
node src/cli.js status <creation_id>
node src/cli.js publish <creation_id>
```

Story image:

```bash
node src/cli.js story-image 'https://example.com/story.png'
node src/cli.js status <creation_id>
node src/cli.js publish <creation_id>
```

Story video:

```bash
node src/cli.js story-video 'https://example.com/story.mp4'
node src/cli.js status <creation_id>
node src/cli.js publish <creation_id>
```

## Common Failure Modes

- Missing permissions: the app has not been approved for publishing.
- Personal account: Instagram personal accounts cannot use official publishing.
- Private or expiring media URL: Instagram must be able to fetch the image/video directly.
- Video still processing: check `status` before publishing.
- Carousel child failed: check each child container ID returned by `carousel`.
- Too many or too few carousel slides: Instagram image carousels require 2-10 images.
- Graph version mismatch: set `IG_GRAPH_VERSION` to the version available for the Meta app.
- Expired long-lived token: run `node src/cli.js refresh-token`.
- Missing insights: `my-media` still works without `--include-insights`, but outlier ranking may fall back to likes/comments instead of view-style metrics.
