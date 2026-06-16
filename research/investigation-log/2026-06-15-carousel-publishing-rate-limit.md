---
doc_schema: "doc-frontmatter-v1"
doc_id: "igbot/research/investigation-log/2026-06-15-carousel-publishing-rate-limit"
doc_type: "investigation_log"
doc_status: "active"
title: "Carousel Publishing Rate-Limit Investigation"
description: "Investigation of carousel publish failures and retry behavior through igbot."
created: "2026-06-15"
updated: "2026-06-15"
memory_eligible: true
memory_priority: "medium"
doc_tags:
  - "domain:social-media"
  - "platform:instagram"
  - "tool:igbot"
  - "type:investigation_log"
---
# Carousel Publishing Rate-Limit Investigation

## Summary

The Instagram Graph API carousel path was valid. The failure was in the media
ingest and status-polling behavior around a multi-child carousel publish.

The successful path was:

1. Use direct-public HTTPS URLs for each media child.
2. Create carousel child containers.
3. Wait for each child container to reach `FINISHED`.
4. Create the parent `CAROUSEL` container.
5. Wait for the parent container.
6. Publish the parent container.
7. Poll slowly enough to avoid treating transient Meta status-check rate limits
   as hard failures.

The static PNG carousel eventually published successfully in a production
account test. API verification showed all five published children were
`IMAGE`, so that post was expected to be static and not show MP4 motion effects.

The motion MP4 carousel later published successfully after re-encoding the MP4
pages and using `carousel-media`. API verification showed all five published
children were `VIDEO`.

## What Failed

### Attempt 1: MP4 Carousel With Presigned S3 URLs

The MP4 assets were valid locally:

- H.264 MP4
- `1080 x 1350`
- `3.0s`
- `24fps`

They were uploaded to S3 and presigned URLs were generated. Ranged `GET`
requests worked, but `HEAD` returned `403`. Instagram's video processing path
appears to require a cleaner direct-fetch URL than the presigned URL behavior
provided in this attempt.

Result:

- First Instagram video child container failed with status `ERROR`.
- No parent carousel was published.

### Attempt 2: MP4 Carousel With Direct-Public URLs

The MP4 files were re-uploaded under an existing public-read S3 prefix. Each
media URL returned `HEAD 200`, so the direct-fetch issue was fixed.

Result:

- The flow reached status polling.
- Meta returned a transient Graph API rate-limit error while checking child
  container status.
- Error class:
  - `OAuthException`
  - `code: 4`
  - `error_subcode: 1349210`
  - `is_transient: true`
  - user message: rate limit exceeded
- No parent carousel publish response was returned.

### Attempt 3: Static PNG Fallback

The static PNG posters were uploaded to direct-public S3 URLs and verified with
`HEAD 200`.

Result:

- The same transient rate-limit error appeared while polling the first child
  container.
- No publish completed in this attempt.

## Root Cause

The root cause was not that Instagram carousels are unsupported.

The immediate issue was that `igbot` treated transient status-polling failures
as fatal. The CLI was doing the correct high-level sequence, but its
`waitForContainer` loop threw immediately when Meta returned a transient
rate-limit response from `GET /{container_id}?fields=status_code,status`.

Because carousel publishing requires multiple child containers plus a parent
container, status polling can easily hit a flaky or rate-limited Graph node.
The client needs to treat transient rate limits as "wait and retry", not "the
publish failed permanently."

There was also a separate media-hosting lesson:

- Presigned URLs that support `GET` may still fail platform ingestion if `HEAD`
  or processor-side validation does not behave like a normal public asset.
- Direct-public media URLs are safer for Instagram ingestion.

## Fix Applied

`src/client.js` now preserves API error metadata on thrown request errors:

- HTTP status
- parsed API payload

`waitForContainer` now recognizes transient status-check errors:

- `error.payload.error.is_transient === true`
- Graph API `code === 4`
- HTTP `429`

When those appear, it backs off and retries instead of throwing immediately.
The successful static retry used:

```bash
node src/cli.js carousel ... --poll-interval 60 --timeout 900 --publish
```

The static PNG carousel published successfully with that slower/backoff path.

## Regression Coverage

`test/client-carousel.test.mjs` now includes a regression test where the first
container status check returns a transient `OAuthException code 4`, then the
second status check returns `FINISHED`. The expected behavior is that
`waitForContainer` retries and succeeds.

## Remaining Risk

MP4 carousel publishing is now proven for this account/tooling, but the first
exact-3-second video-only exports were not the assets that succeeded.

The static production test should be treated as a static-posting proof, not a
motion-carousel proof. API verification showed the parent `CAROUSEL_ALBUM`
contained five `IMAGE` children. Any animated cursor/scan/human-loop work from
matching MP4 exports was not included because the successful static retry used
the PNG fallback command:

```bash
node src/cli.js carousel ... --poll-interval 60 --timeout 900 --publish
```

To get motion on the live carousel, the publish must use `carousel-media` with
`video:<url>` children, not `carousel` with image URLs.

Successful motion retry:

1. Re-encode each MP4 as `4.0s`, H.264, yuv420p, faststart, with silent AAC
   audio.
2. Use direct-public MP4 URLs that return `HEAD 200`.
3. Publish with `carousel-media` and `video:<url>` children.
4. Use slow polling: `--poll-interval 60 --timeout 1200`.

Recommended future default:

- Static fallback: `carousel` with PNG URLs.
- Motion release: `carousel-media` with IG-ready MP4 URLs.
- Do not expect motion if the published children verify as `IMAGE`.

## External References

- Meta content publishing docs:
  `https://developers.facebook.com/docs/instagram-platform/content-publishing/`
- Meta media endpoint reference:
  `https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/`
- Carousel implementation example:
  `https://github.com/TiagoGrosso/instagram-graph-api-lib`

Common pattern across references:

- create child containers first
- wait for child processing
- create parent carousel
- wait for parent processing
- publish the parent
