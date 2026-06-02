# Session Photos Design Specification

## Overview
Currently, the "Record a session" page only allows a single photo (`image_url`) per session. The goal is to allow up to 5 photos per session to increase engagement without bloating database storage on the free tier. One photo is designated as a "keeper" (permanent), and up to 4 photos are "temporary" (deleted after 24 hours). The UI will display these using a photo carousel on the session posts in the feed.

## Architecture

### Database Schema
We will create a new table `session_photos` in Supabase to track all photos associated with a session.

**Table: `session_photos`**
- `id`: UUID (Primary Key)
- `session_id`: UUID (Foreign Key to `sessions.id`)
- `image_url`: Text (URL of the uploaded photo in Supabase Storage)
- `is_keeper`: Boolean (Indicates if this is the permanent photo)
- `expires_at`: Timestampz (Nullable. Set to 24 hours after creation for temporary photos, or `null` for the keeper photo)
- `created_at`: Timestampz

**Data Migration**: 
A migration script will be created to move existing `sessions.image_url` data into the new `session_photos` table, setting `is_keeper = true` and `expires_at = null`, and maintaining backwards compatibility by either keeping the `image_url` on `sessions` or updating queries to use the new table. (To keep things clean, we will update the application to read from `session_photos` and deprecate `image_url` on the `sessions` table).

### Storage Cleanup
- **Supabase Edge Function (`cleanup-temporary-photos`)**: An edge function will be created and scheduled (e.g., via `pg_net` cron or Supabase Scheduled Functions depending on available tier functionality) to run periodically (e.g. hourly).
- **Function Logic**:
  1. Query `session_photos` for all rows where `expires_at < NOW()`.
  2. For each record, delete the corresponding file from the Supabase Storage bucket.
  3. Delete the row from the `session_photos` table.

## Components & UI Changes

### Record a Session (`RecordScreen.tsx`)
- **Photo Picker Update**: Modify `expo-image-picker` to allow multiple selection (up to 5 images).
- **Selection UI**: Display selected photos in a horizontal scroll view.
- **Keeper Designation**: By default, the first photo is the keeper. The user can tap a "star" icon on any selected photo to change the keeper. The selected keeper will be highlighted.
- **Contextual Text**: Display a small label explaining: *"The starred photo stays forever. Others disappear after 24 hours."*
- **Upload Flow**: On save, all photos are uploaded to Supabase Storage, and their respective records are inserted into `session_photos` with appropriate `is_keeper` and `expires_at` metadata.

### Feed Display (`FeedScreen` / Session Cards)
- **Data Fetching**: Update queries fetching sessions to also fetch related `session_photos`.
- **Carousel Component**: The session post UI will use the existing `PubCrawlMediaCarousel` (or an abstracted version) to display multiple photos.
- **Ordering**: The keeper photo should always be displayed as the first slide in the carousel, followed by any remaining temporary photos.

## Error Handling & Edge Cases
- **Deletion Failures**: If the cleanup edge function fails to delete a file from Storage, it should log the error and skip deleting the database row so it can be retried on the next run.
- **Legacy Posts**: Existing posts without multiple photos will naturally render a single photo (no carousel navigation needed), as they will be migrated to have one keeper photo in the `session_photos` table.
- **Storage Limits**: By enforcing the 24-hour expiration via automated cleanup, we prevent temporary photos from accumulating and hitting Supabase storage limits.

## Testing Strategy
- Verify that selecting multiple photos correctly assigns exactly one keeper.
- Verify that saving a session successfully inserts multiple rows into `session_photos`.
- Verify that feed queries correctly join and display the carousel with the keeper photo first.
- Manually trigger the edge function (or use a test query) with fake expired records to ensure both the row and the storage object are deleted.
