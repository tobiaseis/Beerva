# Active Session Photo Save Design

## Summary

Add a local save action for the user's own photos while they have an active recording session. The action is available from the existing "Session photos" thumbnail strip on `RecordScreen`.

The user long-presses a session photo thumbnail, then chooses "Save Photo" from a small bottom-sheet action menu. The app saves that exact photo to the phone's camera roll/gallery on iOS and Android.

## Goals

- Let the current user save one of their active-session photos to their device.
- Keep saving limited to the user's own active session photos.
- Keep the existing recording UI uncluttered.
- Support both iPhone and Android native builds.
- Preserve the existing keeper/remove photo behavior.

## Non-Goals

- No saving photos from the feed.
- No saving other users' live preview photos.
- No saving after the session is no longer active.
- No share flow or export album management.
- No database schema changes.

## User Experience

While recording an active session, the "Session photos" strip continues to show selected photos with the star and remove controls.

When the user long-presses a photo tile:

1. A bottom-sheet menu opens.
2. The menu shows "Save Photo" for the selected thumbnail.
3. Tapping "Save Photo" requests media-library write permission if needed.
4. If permission is granted, the photo is saved to the device camera roll/gallery.
5. The user sees a success alert.

If permission is denied, the app shows a short alert explaining that photo library access is needed. If the save fails, the app shows a retryable error message.

## Technical Design

Add `expo-media-library` so native builds can write images to the device photo library. Configure app permissions with a clear iOS photo library usage message and Android media write permission support through Expo config.

Add a small helper module at `src/lib/devicePhotoSave.ts` with one exported function:

```ts
export const saveImageToDeviceLibrary = async (imageUri: string): Promise<void>
```

The helper will:

- Return an error for blank image URIs.
- Request media-library permission with write-only access where supported.
- Save local file URIs directly with `MediaLibrary.saveToLibraryAsync`.
- For remote `http` or `https` image URLs, download the image to a temporary cache file first using `expo-file-system`, then save that local file.
- Keep web unsupported with a clear error, since this feature is for iPhone and Android.

Update `RecordScreen.tsx`:

- Track the currently selected photo for the save action.
- Add `onLongPress` to each session photo tile.
- Render an action-sheet modal using the existing photo choice sheet styling.
- Add a "Save Photo" action with a download/save icon.
- Disable save actions while another photo save is in progress.
- Call `saveImageToDeviceLibrary(image.uri || image.persistedUrl)` for the selected photo.
- Show success, permission, and failure alerts using the existing `showAlert` helper.

## Data Flow

1. User long-presses a photo tile in the active session strip.
2. `RecordScreen` stores that photo and opens the save menu.
3. User taps "Save Photo".
4. `RecordScreen` calls `saveImageToDeviceLibrary` with the selected image URI.
5. The helper requests permission, prepares a local file if needed, and saves it to the device library.
6. `RecordScreen` closes the menu and shows the result.

## Error Handling

- Blank URI: show "Could not save photo."
- Web runtime: show "Saving photos is available in the iPhone and Android app."
- Permission denied: show "Photo library access needed."
- Download failure: show "Could not prepare this photo for saving."
- Native save failure: show "Could not save photo."

The selected photo remains in the session regardless of save success or failure.

## Testing

Follow TDD during implementation.

Add tests that verify:

- `package.json` includes `expo-media-library`.
- `app.json` contains iOS photo library usage copy.
- A save helper exports `saveImageToDeviceLibrary`.
- The helper requests media-library permission with write-only intent.
- The helper saves local file URIs directly.
- The helper downloads remote URLs before saving.
- `RecordScreen` imports the helper.
- Session photo tiles expose `onLongPress`.
- The save action modal includes "Save Photo".
- The save action calls the helper for the selected photo.
- Feed and live preview components are not changed to expose save actions.

## Open Decisions

None. Approved behavior is option 1: long-press an active-session photo thumbnail, then tap "Save Photo" to save that specific photo to the phone.
