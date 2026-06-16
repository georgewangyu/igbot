---
doc_schema: "doc-frontmatter-v1"
doc_id: "igbot/research/investigation-log/2026-06-15-carousel-audio-and-music-limitations"
doc_type: "investigation_log"
doc_status: "active"
title: "Carousel Audio and Instagram Music Limitations"
description: "Public-safe notes on automated carousel audio, Instagram music, and native composer limits."
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
# Carousel Audio and Instagram Music Limitations

## Summary

`igbot` can publish static image carousels and motion/video carousels through
the official Graph API path, but Instagram-library music and trending audio are
not the same capability as MP4 carousel audio.

## Proven Automated Paths

### Static Carousel

Use `carousel` with image URLs:

```bash
node src/cli.js carousel \
  'https://example.com/slide-1.png' \
  'https://example.com/slide-2.png' \
  --caption 'caption' \
  --poll-interval 60 \
  --timeout 900 \
  --publish
```

Expected result: `CAROUSEL_ALBUM` with `IMAGE` children. This is static.

### Motion Carousel

Use `carousel-media` with `video:<url>` children:

```bash
node src/cli.js carousel-media \
  'video:https://example.com/slide-1.mp4' \
  'video:https://example.com/slide-2.mp4' \
  --caption 'caption' \
  --poll-interval 60 \
  --timeout 1200 \
  --publish
```

Expected result: `CAROUSEL_ALBUM` with `VIDEO` children. Motion appears because
the carousel items are videos.

Recommended MP4 export shape:

- direct-public HTTPS URL that returns `HEAD 200`
- H.264
- yuv420p
- faststart
- at least `4s` for short loops
- silent AAC audio when no real audio is intended

## What Is Not Proven or Exposed

The official carousel publishing path used here does not expose a known
parameter for selecting a trending Instagram audio track from the Instagram
music library and attaching it to a feed carousel.

The native Instagram app may expose "Add music" for some image-only carousel
posts before sharing, but that is a composer/editor feature, not something this
Graph API workflow currently controls.

Instagram's public help also distinguishes image-carousel music from video
carousels: music cannot be added to carousels that contain videos, because
video carousel items carry their own audio track.

## Practical Rule

- If a carousel must be fully automated and animated, bake any desired audio
  into the MP4 children and publish with `carousel-media`.
- If a carousel must use Instagram-library/trending music, use a native
  Instagram composer workflow before publishing, or consider a Reel workflow
  if music API access is available for the account/app.
- Do not expect a published carousel to be editable later for adding music.

## Sources

- Instagram carousel music help:
  `https://help.instagram.com/1223433768344104/`
- Meta content publishing docs:
  `https://developers.facebook.com/docs/instagram-platform/content-publishing/`
- Instagram media endpoint reference:
  `https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/`
