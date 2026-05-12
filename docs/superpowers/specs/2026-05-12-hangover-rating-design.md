# Hangover Rating Design

## Goal
After a user publishes a late-night drinking post, Beerva should send a funny 11am local-time prompt asking them to rate their hangover from 1-10, then show that score on the related feed post.

## Rules
- A prompt is created only for posts published during the drinking-night window: local publish time >= 21:00 or < 06:00.
- Prompt time is 11:00 local time on the next drinking day, where drinking day follows the app's existing "local time minus 6 hours" model.
- Normal session prompts update `sessions.hangover_score`.
- Pub crawl prompts update `pub_crawls.hangover_score`.
- Scores are integers from 1 to 10.
- A score badge appears in the bottom right of the post content, above cheers and comments.

## Architecture
The database owns prompt eligibility and timing. Publish triggers create rows in `hangover_prompts`; a scheduled Supabase Edge Function claims due rows and inserts `hangover_check` notifications. The existing notification webhook and service worker deliver push notifications, and the PWA deep-link opens a dedicated quick rating screen.

## UI
The rating screen is intentionally quick: it shows a short funny title, the related post context, and ten large score buttons. One tap saves through the `rate_hangover` RPC and returns the user to the feed.

## Reliability
Browser timers are not used because a PWA cannot reliably wake itself while closed. Backend scheduling, atomic prompt claiming, and owner-scoped database updates are the source of truth.
