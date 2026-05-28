# Instagram Access Notes

## Practical Read

Instagram is feasible for automation, but not as frictionless as X posting.

The useful official first version is:

- official API only
- one authenticated product account
- public URL media inputs
- owned-account media analytics and outlier ranking
- image publishing and Reel/video publishing
- no browser automation fallback

The useful experimental research version mirrors `tiktokbot`:

- keep official API for owned-account telemetry
- add a manual/provider row scorer
- add an unofficial Python bridge for low-volume profile/search/hashtag public
  discovery through `instagrapi`
- keep hosted providers and Playwright as fallback options, not the default path

## Constraints

- Publishing is gated by Meta app setup and permission review.
- Newer Instagram-login flows and older Facebook-login Graph flows may use different Graph hosts; `IG_GRAPH_BASE_URL` is configurable for that reason.
- Native composer features are not equivalent to API features.
- Local files need a hosting step before publishing because Instagram ingests media from URLs.
- Reels/video posts may require a two-step create/status/publish flow.
- Account health matters; aggressive account creation/posting can still look spammy even if the API call succeeds.
- Unofficial public discovery can trigger login challenges, rate limits, or
  account trust issues. Keep it low-volume, session-backed, and explicitly
  labeled experimental.

## Hook Testing Workflow

For SnackVoice-style short-form testing, `igbot` should sit behind a content queue:

1. Generate hook and caption.
2. Render or export a short demo video.
3. Upload media to a public, stable URL.
4. Create a video/Reel container.
5. Publish after processing succeeds.
6. Record post ID, caption, hook, and performance metrics separately.

The API helps ship content, but it does not solve the creative loop. The loop is still hook selection, fast demo production, and measuring which posts convert.

## Public Discovery Workflow

For competitor/outlier research, prefer this order:

1. `score-file` for manually collected or provider-exported rows.
2. `private-profile` for known creator baselines.
3. `private-search` or `private-hashtag` for low-volume inspiration sweeps.
4. Hosted provider APIs only if local/private collection becomes too brittle.
5. Playwright browser automation only if both structured routes fail.
