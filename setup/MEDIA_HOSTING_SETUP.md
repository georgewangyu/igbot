---
doc_schema: "doc-frontmatter-v1"
doc_id: "igbot/setup/MEDIA_HOSTING_SETUP"
doc_type: "setup_guide"
doc_status: "active"
title: "Media Hosting Setup for Instagram Publishing"
description: "Public-safe setup guide for hosting local media so Instagram Graph API can ingest it."
created: "2026-06-16"
updated: "2026-06-16"
memory_eligible: true
memory_priority: "medium"
doc_tags:
  - "domain:social-media"
  - "platform:instagram"
  - "tool:igbot"
  - "type:setup"
---
# Media Hosting Setup for Instagram Publishing

Instagram's content publishing API ingests media from public URLs. Local files
cannot be passed directly to `igbot`, and presigned URLs can fail video ingest
when Instagram's processor cannot perform a normal `HEAD` request.

The reliable pattern is:

1. Put publish-ready media under a short-lived direct-public HTTPS prefix.
2. Verify every URL returns `HEAD 200` with the expected content type.
3. Publish with `igbot`.
4. Delete the temporary media.
5. Remove the temporary public-read policy.

## Recommended S3 Pattern

Use an existing private bucket or dedicated media-ingest bucket. Do not make the
whole bucket public. Add a narrow temporary public-read policy for a dated
prefix only.

Example prefix:

```text
ig-temp/YYYY-MM-DD-post-slug/*
```

Example policy statement to merge into the bucket policy:

```json
{
  "Sid": "AllowPublicReadIgTempPostSlug",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::YOUR_BUCKET/ig-temp/YYYY-MM-DD-post-slug/*"
}
```

Upload media with the correct content type:

```bash
aws s3 cp ./slide-01.mp4 \
  s3://YOUR_BUCKET/ig-temp/YYYY-MM-DD-post-slug/slide-01.mp4 \
  --content-type video/mp4 \
  --cache-control no-store
```

Verify public ingest behavior before calling `igbot`:

```bash
curl -I https://YOUR_BUCKET.s3.YOUR_REGION.amazonaws.com/ig-temp/YYYY-MM-DD-post-slug/slide-01.mp4
```

Expected response properties:

- HTTP `200`
- `Content-Type: video/mp4` for MP4 assets
- `Content-Type: image/png` or `image/jpeg` for image assets

## Publishing Motion Carousels

Use `carousel-media` with explicit `video:` children:

```bash
node src/cli.js carousel-media \
  'video:https://YOUR_PUBLIC_URL/slide-01.mp4' \
  'video:https://YOUR_PUBLIC_URL/slide-02.mp4' \
  --caption 'caption text' \
  --poll-interval 60 \
  --timeout 1200 \
  --publish
```

For static image carousels, use `carousel` with public image URLs. The plain
`carousel` command always creates image children; it will not publish local MP4
motion pages.

## Cleanup

After the post is live:

```bash
aws s3 rm s3://YOUR_BUCKET/ig-temp/YYYY-MM-DD-post-slug/ --recursive
```

Then restore the previous bucket policy or remove the temporary statement.

Verify cleanup:

```bash
aws s3 ls s3://YOUR_BUCKET/ig-temp/YYYY-MM-DD-post-slug/ --recursive
aws s3api get-bucket-policy --bucket YOUR_BUCKET --query Policy --output text
```

The prefix should be empty, and the temporary public-read statement should be
gone.

## Guardrails

- Do not commit real bucket names, account IDs, tokens, or private local paths
  into this public repo.
- Keep temporary public prefixes narrow and dated.
- Prefer direct-public URLs over presigned URLs for video carousel children.
- Keep MP4s Instagram-friendly: H.264, `yuv420p`, faststart, at least `4s`,
  and AAC audio when the file is video-led.
