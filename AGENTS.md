# IGBot Agent Instructions

## Required Startup Context

At the start of a session in this repository, read:

1. `README.md`
2. `VISION.md`

## Mission

`igbot` is an Instagram operator client for official publishing, owned-account
inspection, and bounded experimental public-data collection. Keep the official
Graph API path legible and clearly separated from unofficial bridges.

## Working Rules

1. Read `VISION.md` before changing product direction or access strategy.
2. Treat official publishing as the stable product surface.
3. Keep experimental `instagrapi` or unofficial collection paths labeled as
   brittle and secondary.
4. Do not hide Meta setup friction behind vague onboarding language.

## Validation

```bash
npm run env
npm test
```
