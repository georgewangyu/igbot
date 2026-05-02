# Instagram Access Notes

## Practical Read

Instagram is feasible for automation, but not as frictionless as X posting.

The useful first version is:

- official API only
- one authenticated product account
- public URL media inputs
- image publishing and Reel/video publishing
- no browser automation fallback

## Constraints

- Publishing is gated by Meta app setup and permission review.
- Newer Instagram-login flows and older Facebook-login Graph flows may use different Graph hosts; `IG_GRAPH_BASE_URL` is configurable for that reason.
- Native composer features are not equivalent to API features.
- Local files need a hosting step before publishing because Instagram ingests media from URLs.
- Reels/video posts may require a two-step create/status/publish flow.
- Account health matters; aggressive account creation/posting can still look spammy even if the API call succeeds.

## Hook Testing Workflow

For SnackVoice-style short-form testing, `igbot` should sit behind a content queue:

1. Generate hook and caption.
2. Render or export a short demo video.
3. Upload media to a public, stable URL.
4. Create a video/Reel container.
5. Publish after processing succeeds.
6. Record post ID, caption, hook, and performance metrics separately.

The API helps ship content, but it does not solve the creative loop. The loop is still hook selection, fast demo production, and measuring which posts convert.
