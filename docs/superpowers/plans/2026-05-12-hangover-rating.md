# Hangover Rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 11am local hangover prompts for late-night published posts and show the submitted score on the feed.

**Architecture:** Supabase triggers create prompt rows at publish time, a scheduled Edge Function creates due notifications, and the PWA deep-links to a fast rating screen. Scores are stored on the target post and rendered as a bottom-right badge above engagement controls.

**Tech Stack:** Expo React Native Web, React Navigation, Supabase Postgres/RLS/RPC, Supabase Edge Functions, Web Push service worker.

---

### Task 1: Contract Test

**Files:**
- Create: `scripts/hangover.test.js`
- Modify: `package.json`

- [ ] Add a source/migration contract test for the migration, scheduled function, push function, navigator, rating screen, feed badge, pub crawl badge, and timezone snapshot.
- [ ] Run `node scripts/hangover.test.js` and confirm it fails because implementation files are missing.

### Task 2: Database Model

**Files:**
- Create: `supabase/migrations/20260512170000_add_hangover_prompts.sql`

- [ ] Add `timezone`, `hangover_score`, and `hangover_rated_at` columns to `sessions` and `pub_crawls`.
- [ ] Add `profiles.timezone`.
- [ ] Add `hangover_prompts` with one nullable target column for `session_id` or `pub_crawl_id`.
- [ ] Add helper functions for safe timezone resolution, 11am prompt calculation, prompt creation, atomic due-prompt claiming, and owner-scoped rating.
- [ ] Extend `notifications_type_check` to include `hangover_check`.

### Task 3: Scheduled Delivery

**Files:**
- Create: `supabase/functions/send-hangover-prompts/index.ts`
- Modify: `supabase/functions/send-push/index.ts`
- Modify: `public/sw.js`

- [ ] Claim due prompts with `claim_due_hangover_prompts`.
- [ ] Insert `hangover_check` notifications with target metadata.
- [ ] Mark prompts sent or release them with `last_error`.
- [ ] Add push copy and a `/?hangover=1&target_type=...&target_id=...` deep link.
- [ ] Bump the service worker cache name.

### Task 4: Client Routing And Rating

**Files:**
- Create: `src/screens/HangoverRatingScreen.tsx`
- Create: `src/lib/timezone.ts`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/NotificationsScreen.tsx`
- Modify: `src/lib/notificationMessages.ts`

- [ ] Parse hangover launch URLs in the root navigator.
- [ ] Register `HangoverRating`.
- [ ] Build a quick 1-10 rating screen that calls `rate_hangover`.
- [ ] Add notification-list support for `hangover_check`.

### Task 5: Feed And Session Integration

**Files:**
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `src/screens/ProfileSetupScreen.tsx`
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/screens/FeedScreen.tsx`
- Modify: `src/lib/pubCrawls.ts`
- Modify: `src/lib/pubCrawlsApi.ts`
- Modify: `src/components/PubCrawlFeedCard.tsx`

- [ ] Store current timezone when starting and publishing sessions.
- [ ] Store timezone in profile upserts.
- [ ] Fetch hangover scores for sessions and pub crawls.
- [ ] Render the bottom-right hangover badge above cheers/comments.

### Task 6: Verification

**Commands:**
- `node scripts/hangover.test.js`
- `npm run test:notifications`
- `npm run test:pub-crawl`
- `npm run build:web`

- [ ] Run all commands fresh.
- [ ] Inspect output and fix any failures before reporting completion.
