# Beer Chugging Feature Design

## Summary

Add a 33cl bottled-beer chug attempt feature to the active session recording flow. A user can choose or create a 33cl beer, choose one mutual follower as verifier, record a short video, and let Beerva estimate the chug duration locally with MediaPipe. The result appears immediately on the session post as `Unverified`. The chosen mutual follower can later verify or reject the attempt from a notification-backed review flow.

The first version is intentionally narrow: only bottled 33cl beers, local MediaPipe analysis only, and human verification for whether the beer was actually finished. No Gemini, cloud AI analysis, custom empty-bottle classifier, global leaderboard, or multi-verifier flow is included.

## Requirements

- Add a `How fast can you chug?` entry point while recording an active session.
- Allow chug attempts only for bottled 33cl beers.
- Attach every chug attempt to an existing or newly created `session_beers` row.
- Require the user to choose exactly one mutual follower as verifier before recording.
- Record a short capped video for the attempt.
- Analyze the video locally with MediaPipe to estimate mouth-contact start and mouth-contact end.
- Save the accepted result immediately as `unverified`.
- Upload the compressed video only as temporary proof for the chosen verifier.
- Show the fastest non-rejected chug attempt under feed `More stats` as soon as it exists.
- Allow the chosen verifier to approve or reject the attempt.
- Delete the stored proof video after verification or rejection.
- Keep result metadata after the video is deleted.
- Do not use Gemini or any other paid/cloud AI analysis in v1.
- Do not attempt to prove bottle emptiness automatically in v1.
- Do not support cans, pints, cups, glasses, shots, RTDs, wine, mixed drinks, or non-33cl volumes in v1.

## Current App Context

`RecordScreen` already owns the active session flow, including the drink list, beer draft form, session photo/video-adjacent camera actions, session publishing, and active-session fetching. Drinks are stored in `session_beers`, with legacy summary fields synchronized onto `sessions` for older display paths.

`FeedScreen` already fetches visible sessions, related `session_beers`, cheers, comments, and profile rows. The session card has a `More stats` panel with a compact stat grid, making it the natural place to render `Fastest chug`.

The app already has mutual social graph primitives through `follows`, plus notification delivery through `notifications`, `metadata`, realtime, and push webhooks. The chug verification flow should reuse these patterns rather than creating a separate messaging system.

## User Flow

When a user has an active session, the Drinks surface shows a compact action:

```text
How fast can you chug?
```

Selecting it opens a setup flow:

1. Choose an existing eligible drink or create a new one.
2. Eligible drinks are only beer entries with `volume = 33cl`.
3. New drinks created from this flow force `volume = 33cl` and `container_type = bottle`.
4. Choose exactly one mutual follower as verifier.
5. Open the camera in video mode with clear recording controls and a short maximum duration, around 15 seconds.

After recording, the app runs local analysis and shows a review state:

- detected duration
- confidence or quality status
- selected beer name
- retry action
- discard action
- accept attempt action

Accepting the attempt stores it as `unverified`, uploads the temporary proof video, and sends a verification notification to the chosen mutual follower. The active session can continue normally, and publishing the session later includes the fastest chug in `More stats`.

## Data Model

Add `public.session_chug_attempts`.

```text
id uuid primary key default gen_random_uuid()
session_id uuid not null references public.sessions(id) on delete cascade
session_beer_id uuid not null references public.session_beers(id) on delete cascade
user_id uuid not null references auth.users(id) on delete cascade
verifier_user_id uuid not null references auth.users(id) on delete restrict
status text not null default 'unverified'
duration_ms integer not null
confidence_score double precision
detected_start_ms integer
detected_end_ms integer
container_type text not null default 'bottle'
required_volume text not null default '33cl'
video_path text
thumbnail_path text
verifier_note text
created_at timestamptz not null default now()
verified_at timestamptz
```

Constraints:

- `status in ('unverified', 'verified', 'rejected')`
- `duration_ms > 0`
- `duration_ms <= 15000`
- `container_type = 'bottle'`
- `required_volume = '33cl'`
- `user_id <> verifier_user_id`

Recommended indexes:

- `(session_id, status, duration_ms)`
- `(user_id, created_at desc)`
- `(verifier_user_id, status, created_at desc)`
- `(session_beer_id)`

The table should keep multiple attempts per session. Feed display chooses the fastest attempt where `status <> 'rejected'`.

## Storage

Store proof videos in Supabase Storage, not Postgres. Add a private bucket such as:

```text
chug_videos
```

The database stores only `video_path` and optional `thumbnail_path`. Videos are temporary. When the verifier approves or rejects an attempt, a verifier review RPC deletes the video object directly or delegates deletion to an Edge Function if storage permissions require it, then clears `video_path`. The result row remains for session history and feed stats.

The recording flow should keep the file small:

- short cap, around 15 seconds
- compressed before upload when practical
- resolution low enough for review, such as 720p or lower
- upload only after the user accepts the detected attempt

## MediaPipe Analysis

Use local MediaPipe analysis only. V1 measures mouth-contact duration, not confirmed empty-bottle completion.

Pipeline:

- Face Landmarker detects mouth/lip landmarks.
- Object Detector detects bottle-like containers.
- A frame processor computes whether the bottle bounding box overlaps a mouth region derived from lip landmarks.
- A state machine measures stable contact.

State machine:

```text
ready -> drinking -> finished
```

Rules:

- Start when bottle-mouth overlap is stable for a short debounce window.
- Stop when overlap disappears for a short grace period, roughly 250-400ms.
- Ignore single-frame flickers.
- Fail analysis if the face or bottle is missing for too much of the recording.
- Store `detected_start_ms`, `detected_end_ms`, `duration_ms`, and `confidence_score`.

Confidence can combine:

- percentage of usable frames
- face detection stability
- bottle detection stability
- clear start transition
- clear end transition
- plausible duration

The review UI should make the limitation clear through status copy, not a long explanation: the app detected contact timing, and the verifier confirms the attempt.

## Verification

Before recording, the user must choose one mutual follower. A mutual follower means both follow rows exist:

```text
current user -> verifier
verifier -> current user
```

After the attempt is accepted, insert a notification:

```text
type = 'chug_verification'
reference_id = session_chug_attempts.id
metadata = {
  target_type: 'chug_attempt',
  session_id,
  beer_name,
  duration_ms,
  pub_name
}
```

Notification copy:

```text
wants you to verify a 33cl bottle chug.
```

The verifier opens a review screen from the notification. The screen shows:

- owner username and avatar
- pub/session context
- beer name
- detected duration
- proof video
- approve action
- reject action
- optional short verifier note

Approving sets:

```text
status = 'verified'
verified_at = now()
verifier_note = optional note
video_path = null after deletion succeeds
```

Rejecting sets:

```text
status = 'rejected'
verified_at = now()
verifier_note = optional note
video_path = null after deletion succeeds
```

Rejected attempts do not appear as fastest chugs on posts.

## Feed Display

`FeedScreen` should fetch chug attempts for visible session ids, similar to how it fetches `session_beers`, cheers, and comments.

For each session:

1. Ignore rejected attempts.
2. Choose the lowest `duration_ms`.
3. Display it in `More stats`.

Example labels:

```text
Fastest chug
4.8s
Unverified
```

```text
Fastest chug
4.8s
Verified
```

The row should mention 33cl bottle where space allows, for example:

```text
33cl bottle - Unverified
```

If a session has no non-rejected attempts, the feed card remains unchanged.

## Security And RLS

RLS should enforce these access rules:

- Session owners can create attempts only for their own sessions.
- Attempts can be created only for `session_beers` rows in the same session.
- Attempts can be created only with a mutual follower as verifier.
- Session owners can read their own attempts and proof paths.
- Chosen verifiers can read assigned attempts and proof paths.
- Signed-in users can read public result metadata for attempts attached to published sessions through a view or RPC that omits proof paths.
- Only the chosen verifier can approve or reject.
- Verifier updates are limited to verification fields.
- Session owners cannot mark their own attempt as verified.

Because column-level update restrictions are awkward through direct table updates, prefer an RPC for verifier decisions:

```text
public.review_chug_attempt(target_attempt_id uuid, next_status text, note text default null)
```

The RPC validates verifier identity, allowed status transitions, deletes the stored video if possible, clears proof paths, and returns the updated attempt.

## UI Notes

Keep the recording UI compact and action-oriented. This is a utility inside an active session, not a landing page or a separate entertainment mode.

Suggested placement:

- Put `How fast can you chug?` in the Drinks surface, below the existing drink list and above or near the `BeerDraftForm`.
- Use a bottle/clock style icon from `lucide-react-native` if available.
- The setup flow can be a modal sheet matching existing photo/category modal patterns.
- The verifier picker should show mutual followers only, with avatar and username.
- Empty state: `Add a mutual follower before chug verification.`
- Ineligible drink state: `Chugs are 33cl bottled beers only for now.`

## Error Handling

Handle these cases explicitly:

- No active session.
- No mutual followers.
- Camera permission denied.
- Recording cancelled.
- Video too long or missing.
- MediaPipe model loading failed.
- No face detected.
- No bottle detected.
- Contact start or end could not be detected.
- Upload failed after analysis.
- Notification insert failed.
- Verifier opens an already reviewed attempt.
- Proof video was already deleted or unavailable.

If analysis fails, the user can retry or discard. Do not save a chug attempt with no detected duration in v1.

## Testing

Unit and integration-style tests should cover:

- 33cl-only drink eligibility.
- New drink creation from chug setup forces `33cl` and `bottle`.
- Mutual follower filtering.
- Fastest chug selection ignores rejected attempts.
- Fastest chug selection includes unverified and verified attempts.
- Feed formatting for unverified and verified statuses.
- Notification message for `chug_verification`.
- Verifier-only review RPC behavior.
- Owner cannot self-verify.
- Video path is cleared after approve or reject.

Manual verification should cover:

- Starting a chug flow from an active session.
- Retrying after failed analysis.
- Accepting an unverified result.
- Seeing the unverified stat immediately on the post.
- Opening the verifier notification.
- Approving and rejecting attempts.
- Confirming rejected attempts disappear from the feed stat.

## Non-Goals

- Gemini or other cloud video analysis.
- Global chug leaderboards.
- Multi-friend voting.
- Automatic empty-bottle classification.
- Custom model training.
- Non-33cl volumes.
- Cans, cups, pint glasses, wine glasses, shots, RTDs, or mixed drinks.
- Keeping proof videos permanently.
- Letting the session owner mark an attempt verified.
