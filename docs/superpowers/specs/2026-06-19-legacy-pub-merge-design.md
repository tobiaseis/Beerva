# Legacy Pub Duplicate Merge Design

## Goal

Combine posts that belong to the same physical pub when older sessions reference a legacy pub record and newer sessions reference its canonical OpenStreetMap record. Pub Legends will then count every published session under one pub, regardless of whether it was recorded before or after nearby OSM discovery was introduced.

## Root Cause

Pub Legends correctly counts distinct published session IDs. The split occurs earlier in the data model: historical sessions may reference a `public.pubs` row with `source = 'legacy'` and a name such as `Smedekroen, Aalborg`, while newer sessions reference an active OSM row named `Smedekroen` with `city = 'Aalborg'`. Since leaderboard rollups use `sessions.pub_id`, those rows form separate leaderboard entries.

## Selected Approach

Use an idempotent SQL migration that merges only an unambiguous, exact legacy-to-OSM match:

- The legacy row is active, has `source = 'legacy'`, and is still categorized as a real pub.
- The canonical row is active, has `source = 'osm'`, is categorized as a real pub, and has a city.
- The normalized legacy name exactly equals the normalized canonical `name, city` label.
- The legacy row has exactly one matching canonical row. Any zero-match or multi-match legacy row remains unchanged.

This is deliberately stricter than fuzzy matching. It fixes confirmed duplicates without risking cross-city or similarly named pub merges.

## Data Changes

For each eligible pair, the migration will:

1. Reassign every session, regardless of status, from the legacy pub ID to the canonical OSM pub ID.
2. Mark the legacy pub row as `merged`, point `merged_into` at the canonical pub, and reset its `use_count` to zero.
3. Recalculate `use_count` for active real pubs from their published sessions so directory and roulette metadata agree with Pub Legends.

The migration does not edit post content, session timestamps, beer records, profiles, or the PWA/native UI. Reassigning all session statuses prevents active or unpublished sessions from retaining a retired pub reference.

## Safety and Verification

The current production data has one unambiguous legacy pub record with five published sessions eligible for this repair. The known Smedekroen split will become one entry with eight posts. A regression test will assert the migration uses the strict source, category, exact-label, and unique-match safeguards, moves `sessions.pub_id`, and marks the legacy row merged. After deployment, direct SQL checks will confirm the merged record count and the unified Pub Legends count.
