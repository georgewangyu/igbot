# IGBot Vision

`igbot` should be the local Instagram operator for George's workflow:
bootstrap auth, inspect owned-account state, rank owned-media outliers, and
publish posts or Reels through the official path when possible.

## Product Thesis

Instagram access is fragmented. The repo should help the operator reason about
that fragmentation instead of pretending every useful surface is officially
available.

## Goals

- Keep owned-account analytics and publishing reliable through the official API.
- Preserve a narrow experimental bridge for public discovery without confusing
  it with the stable product path.
- Make setup, token, and media-ingest requirements explicit.

## Non-Goals

- Do not market unofficial collectors as stable infrastructure.
- Do not become a generic content calendar or social-media suite.
- Do not hide missing permissions or access limits behind fake success output.
