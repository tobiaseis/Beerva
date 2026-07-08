# Active Session Photo Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the current user long-press one of their active-session photo thumbnails and save that exact image to the iPhone/Android photo library.

**Architecture:** Keep the behavior scoped to `RecordScreen`. Add a focused `devicePhotoSave` helper that owns native media-library permission, remote-image download, and local save details; `RecordScreen` only owns selection, action-sheet state, and user feedback.

**Tech Stack:** Expo React Native, `expo-media-library`, `expo-file-system/legacy`, source-based Node tests, TypeScript.

---

## File Structure

- Create `scripts/activeSessionPhotoSave.test.js`: source and helper behavior checks for the active-session save feature.
- Modify `package.json`: add `test:active-photo-save` and install `expo-media-library` through Expo.
- Modify `package-lock.json`: updated by `npx expo install expo-media-library`.
- Modify `app.json`: add the `expo-media-library` config plugin with save-photo permission copy.
- Create `src/lib/devicePhotoSave.ts`: one exported function, `saveImageToDeviceLibrary(imageUri)`.
- Modify `src/screens/RecordScreen.tsx`: add long-press photo action sheet and wire it to the helper.

## Task 1: Add Failing Coverage

**Files:**
- Create: `scripts/activeSessionPhotoSave.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the test script**

In `package.json`, add this script next to the other `test:*` scripts:

```json
"test:active-photo-save": "node scripts/activeSessionPhotoSave.test.js"
```

- [ ] **Step 2: Write the failing test**

Create `scripts/activeSessionPhotoSave.test.js` with this complete content:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

const loadTypeScriptModule = (relativePath, mocks = {}) => {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });

  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));

  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    compiledModule._compile(outputText, filename);
    return compiledModule.exports;
  } finally {
    Module._load = originalLoad;
  }
};

const packageJson = readJson('package.json');
const appJson = readJson('app.json');
const recordScreenSource = readText('src/screens/RecordScreen.tsx');
const feedScreenSource = readText('src/screens/FeedScreen.tsx');
const livePreviewSource = readText('src/components/LiveSessionPhotoPreviewModal.tsx');
const helperPath = path.join(root, 'src/lib/devicePhotoSave.ts');

assert.equal(
  packageJson.scripts['test:active-photo-save'],
  'node scripts/activeSessionPhotoSave.test.js',
  'package.json should expose the active session photo save test'
);
assert.ok(
  packageJson.dependencies['expo-media-library'],
  'expo-media-library should be installed for native photo library saves'
);

const mediaLibraryPlugin = appJson.expo.plugins.find((plugin) => (
  Array.isArray(plugin) && plugin[0] === 'expo-media-library'
));
assert.ok(mediaLibraryPlugin, 'app config should include the expo-media-library plugin');
assert.match(
  mediaLibraryPlugin[1].savePhotosPermission,
  /save session photos/i,
  'iOS save-photo permission copy should explain why Beerva saves photos'
);
assert.deepEqual(
  mediaLibraryPlugin[1].granularPermissions,
  ['photo'],
  'Android media library config should request photo access only'
);

assert.ok(fs.existsSync(helperPath), 'device photo save helper should exist');
const helperSource = fs.readFileSync(helperPath, 'utf8');
assert.match(helperSource, /export const saveImageToDeviceLibrary/, 'helper should export saveImageToDeviceLibrary');
assert.match(
  helperSource,
  /requestPermissionsAsync\(true,\s*\['photo'\]\)/,
  'helper should request write-only photo permission'
);
assert.match(
  helperSource,
  /saveToLibraryAsync\(localUri\)/,
  'helper should save the final local URI to the media library'
);
assert.match(
  helperSource,
  /downloadAsync\(cleanUri,\s*targetUri\)/,
  'helper should download remote images before saving'
);
assert.match(
  helperSource,
  /Platform\.OS === 'web'/,
  'helper should keep web unsupported with a clear error'
);

const createMediaLibraryMock = () => {
  const calls = {
    permissions: [],
    saved: [],
  };
  return {
    calls,
    module: {
      requestPermissionsAsync: async (...args) => {
        calls.permissions.push(args);
        return { granted: true };
      },
      saveToLibraryAsync: async (uri) => {
        calls.saved.push(uri);
      },
    },
  };
};

(async () => {
  const localMedia = createMediaLibraryMock();
  const localHelper = loadTypeScriptModule('src/lib/devicePhotoSave.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-media-library': localMedia.module,
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      documentDirectory: 'file:///documents/',
      downloadAsync: async () => {
        throw new Error('local files should not be downloaded');
      },
    },
  });

  await localHelper.saveImageToDeviceLibrary('file:///tmp/session-photo.jpg');
  assert.deepEqual(localMedia.calls.permissions[0], [true, ['photo']], 'local save should request write-only photo permission');
  assert.deepEqual(localMedia.calls.saved, ['file:///tmp/session-photo.jpg'], 'local save should write the original file URI');

  const remoteMedia = createMediaLibraryMock();
  const downloads = [];
  const remoteHelper = loadTypeScriptModule('src/lib/devicePhotoSave.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-media-library': remoteMedia.module,
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      documentDirectory: 'file:///documents/',
      downloadAsync: async (url, targetUri) => {
        downloads.push({ url, targetUri });
        return { uri: targetUri, status: 200 };
      },
    },
  });

  await remoteHelper.saveImageToDeviceLibrary('https://example.com/photos/session.png?token=abc');
  assert.equal(downloads[0].url, 'https://example.com/photos/session.png?token=abc', 'remote save should download the original image URL');
  assert.match(downloads[0].targetUri, /^file:\/\/\/cache\/beerva-session-photo-\d+\.png$/, 'remote save should preserve a usable image extension');
  assert.deepEqual(remoteMedia.calls.saved, [downloads[0].targetUri], 'remote save should write the downloaded file URI');

  const deniedHelper = loadTypeScriptModule('src/lib/devicePhotoSave.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-media-library': {
      requestPermissionsAsync: async () => ({ granted: false }),
      saveToLibraryAsync: async () => {
        throw new Error('denied saves should not reach native save');
      },
    },
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      documentDirectory: 'file:///documents/',
      downloadAsync: async () => ({ uri: 'file:///cache/photo.jpg', status: 200 }),
    },
  });

  await assert.rejects(
    deniedHelper.saveImageToDeviceLibrary('file:///tmp/session-photo.jpg'),
    /Photo library access needed/,
    'permission denial should produce user-facing permission copy'
  );

  const webHelper = loadTypeScriptModule('src/lib/devicePhotoSave.ts', {
    'react-native': { Platform: { OS: 'web' } },
    'expo-media-library': localMedia.module,
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      documentDirectory: 'file:///documents/',
      downloadAsync: async () => ({ uri: 'file:///cache/photo.jpg', status: 200 }),
    },
  });

  await assert.rejects(
    webHelper.saveImageToDeviceLibrary('file:///tmp/session-photo.jpg'),
    /iPhone and Android app/,
    'web should clearly report that native photo saving is unavailable'
  );

  await assert.rejects(
    localHelper.saveImageToDeviceLibrary('   '),
    /Could not save photo/,
    'blank image URIs should be rejected'
  );

  assert.match(
    recordScreenSource,
    /import \{ saveImageToDeviceLibrary \} from '\.\.\/lib\/devicePhotoSave';/,
    'RecordScreen should import the save helper'
  );
  assert.match(
    recordScreenSource,
    /const \[photoSaveChoice,\s*setPhotoSaveChoice\] = useState<SessionImageDraft \| null>\(null\);/,
    'RecordScreen should track which active-session photo is selected for saving'
  );
  assert.match(
    recordScreenSource,
    /const \[savingDevicePhoto,\s*setSavingDevicePhoto\] = useState\(false\);/,
    'RecordScreen should track device save progress separately from upload progress'
  );
  assert.match(
    recordScreenSource,
    /onLongPress=\{\(\) => openPhotoSaveSheet\(image\)\}/,
    'session photo tiles should open save actions on long press'
  );
  assert.match(
    recordScreenSource,
    /accessibilityHint="Long press to save this photo to your phone\."/,
    'long-press save affordance should be accessible'
  );
  assert.match(
    recordScreenSource,
    /<Text style=\{styles\.photoChoiceLabel\}>Save Photo<\/Text>/,
    'save action sheet should include a Save Photo action'
  );
  assert.match(
    recordScreenSource,
    /saveImageToDeviceLibrary\(photoSaveChoice\.uri \|\| photoSaveChoice\.persistedUrl \|\| ''\)/,
    'save action should pass the selected active-session photo URI to the helper'
  );

  assert.doesNotMatch(feedScreenSource, /Save Photo|saveImageToDeviceLibrary|expo-media-library/, 'feed should not expose photo saving');
  assert.doesNotMatch(livePreviewSource, /Save Photo|saveImageToDeviceLibrary|expo-media-library/, 'live preview should not expose photo saving');

  console.log('active session photo save checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
npm run test:active-photo-save
```

Expected: `FAIL` with an assertion that `expo-media-library` is missing, or that `src/lib/devicePhotoSave.ts` does not exist.

- [ ] **Step 4: Commit the failing coverage**

```bash
git add package.json scripts/activeSessionPhotoSave.test.js
git commit -m "test: cover active session photo saving"
```

## Task 2: Install and Configure Media Library

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`
- Test: `scripts/activeSessionPhotoSave.test.js`

- [ ] **Step 1: Install the Expo-compatible package**

Run:

```bash
npx expo install expo-media-library
```

Expected: `package.json` and `package-lock.json` include `expo-media-library`.

- [ ] **Step 2: Configure native permission copy**

In `app.json`, add the `expo-media-library` plugin to `expo.plugins` after `expo-notifications` and before `expo-font`:

```json
[
  "expo-media-library",
  {
    "photosPermission": "Allow Beerva to access photos so you can save session photos.",
    "savePhotosPermission": "Allow Beerva to save session photos to your photo library.",
    "granularPermissions": ["photo"]
  }
]
```

The resulting `plugins` array should look like this:

```json
"plugins": [
  [
    "expo-notifications",
    {
      "color": "#F5C542",
      "defaultChannel": "default"
    }
  ],
  [
    "expo-media-library",
    {
      "photosPermission": "Allow Beerva to access photos so you can save session photos.",
      "savePhotosPermission": "Allow Beerva to save session photos to your photo library.",
      "granularPermissions": ["photo"]
    }
  ],
  "expo-font"
]
```

- [ ] **Step 3: Run the active-photo-save test**

Run:

```bash
npm run test:active-photo-save
```

Expected: `FAIL` with `device photo save helper should exist`.

- [ ] **Step 4: Commit dependency and config**

```bash
git add package.json package-lock.json app.json
git commit -m "chore: configure media library saves"
```

## Task 3: Add the Device Photo Save Helper

**Files:**
- Create: `src/lib/devicePhotoSave.ts`
- Test: `scripts/activeSessionPhotoSave.test.js`

- [ ] **Step 1: Create the helper**

Create `src/lib/devicePhotoSave.ts` with this complete content:

```ts
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

export const PHOTO_SAVE_ERROR = 'Could not save photo.';
export const PHOTO_LIBRARY_PERMISSION_ERROR = 'Photo library access needed.';
export const PHOTO_SAVE_UNSUPPORTED_ERROR = 'Saving photos is available in the iPhone and Android app.';
export const PHOTO_PREPARE_ERROR = 'Could not prepare this photo for saving.';

type FileSystemLegacy = typeof import('expo-file-system/legacy');

const REMOTE_IMAGE_PATTERN = /^https?:\/\//i;

const getImageExtension = (uri: string) => {
  const cleanPath = uri.split('?')[0].split('#')[0];
  const extension = cleanPath.split('.').pop()?.toLowerCase();

  if (extension && /^[a-z0-9]+$/.test(extension) && extension.length <= 5) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }

  return 'jpg';
};

const getCacheBaseDirectory = (FileSystem: FileSystemLegacy) => {
  const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!directory) throw new Error(PHOTO_PREPARE_ERROR);
  return directory.endsWith('/') ? directory : `${directory}/`;
};

const downloadImageToCache = async (cleanUri: string) => {
  const FileSystem = await import('expo-file-system/legacy');
  const extension = getImageExtension(cleanUri);
  const targetUri = `${getCacheBaseDirectory(FileSystem)}beerva-session-photo-${Date.now()}.${extension}`;
  const result = await FileSystem.downloadAsync(cleanUri, targetUri);

  if (result.status && (result.status < 200 || result.status >= 300)) {
    throw new Error(PHOTO_PREPARE_ERROR);
  }

  return result.uri;
};

const ensureCanSavePhotos = async () => {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) {
    throw new Error(PHOTO_LIBRARY_PERMISSION_ERROR);
  }
};

export const saveImageToDeviceLibrary = async (imageUri: string): Promise<void> => {
  const cleanUri = imageUri.trim();
  if (!cleanUri) {
    throw new Error(PHOTO_SAVE_ERROR);
  }

  if (Platform.OS === 'web') {
    throw new Error(PHOTO_SAVE_UNSUPPORTED_ERROR);
  }

  await ensureCanSavePhotos();

  let localUri = cleanUri;
  if (REMOTE_IMAGE_PATTERN.test(cleanUri)) {
    try {
      localUri = await downloadImageToCache(cleanUri);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : PHOTO_PREPARE_ERROR);
    }
  }

  try {
    await MediaLibrary.saveToLibraryAsync(localUri);
  } catch {
    throw new Error(PHOTO_SAVE_ERROR);
  }
};
```

- [ ] **Step 2: Run the active-photo-save test**

Run:

```bash
npm run test:active-photo-save
```

Expected: `FAIL` with the first `RecordScreen` assertion, such as `RecordScreen should import the save helper`.

- [ ] **Step 3: Commit the helper**

```bash
git add src/lib/devicePhotoSave.ts
git commit -m "feat: add device photo save helper"
```

## Task 4: Wire the Long-Press Save UI

**Files:**
- Modify: `src/screens/RecordScreen.tsx`
- Test: `scripts/activeSessionPhotoSave.test.js`

- [ ] **Step 1: Update imports**

In `src/screens/RecordScreen.tsx`, change the lucide import to include `Download`:

```ts
import { Beer, Camera, CheckCircle2, Clock, Download, Home, Images, LocateFixed, Lock, MapPin, MessageSquare, PlusCircle, Sparkles, Star, Trash2, X } from 'lucide-react-native';
```

Add this helper import below the haptics import:

```ts
import { saveImageToDeviceLibrary } from '../lib/devicePhotoSave';
```

- [ ] **Step 2: Add save UI state**

Near the existing photo state in `RecordScreen`, add:

```ts
const [photoSaveChoice, setPhotoSaveChoice] = useState<SessionImageDraft | null>(null);
const [savingDevicePhoto, setSavingDevicePhoto] = useState(false);
```

- [ ] **Step 3: Reset save UI state with the active session**

Inside `resetActiveState`, after `setSavingPhoto(false);`, add:

```ts
setPhotoSaveChoice(null);
setSavingDevicePhoto(false);
```

- [ ] **Step 4: Add save action handlers**

After `removeSelectedImage`, add:

```ts
const openPhotoSaveSheet = (image: SessionImageDraft) => {
  if (savingPhoto || savingDevicePhoto) return;
  setPhotoSaveChoice(image);
};

const closePhotoSaveSheet = () => {
  if (savingDevicePhoto) return;
  setPhotoSaveChoice(null);
};

const savePhotoToDevice = async () => {
  if (!photoSaveChoice) return;

  setSavingDevicePhoto(true);
  try {
    await saveImageToDeviceLibrary(photoSaveChoice.uri || photoSaveChoice.persistedUrl || '');
    setPhotoSaveChoice(null);
    hapticSuccess();
    showAlert('Photo saved', 'Saved to your camera roll.');
  } catch (error: any) {
    hapticError();
    const message = error?.message || 'Could not save photo.';
    const title = message === 'Photo library access needed.'
      ? 'Photo library access needed'
      : 'Could not save photo';
    showAlert(title, message);
  } finally {
    setSavingDevicePhoto(false);
  }
};
```

- [ ] **Step 5: Make photo tiles long-pressable**

Replace the outer `<View>` for each `selectedImages.map` photo tile with `TouchableOpacity`.

The tile block should start like this:

```tsx
<TouchableOpacity
  key={`${image.uri}-${index}`}
  style={[styles.photoTile, isKeeper ? styles.photoTileKeeper : null]}
  onLongPress={() => openPhotoSaveSheet(image)}
  disabled={savingPhoto || savingDevicePhoto}
  activeOpacity={0.88}
  accessibilityRole="button"
  accessibilityLabel={`Photo ${index + 1}`}
  accessibilityHint="Long press to save this photo to your phone."
>
```

The same block should still end with:

```tsx
</TouchableOpacity>
```

Do not change the existing star and remove buttons inside the tile.

- [ ] **Step 6: Render the save action sheet**

Before the existing `photoChoiceVisible` modal, add this modal:

```tsx
<Modal
  visible={Boolean(photoSaveChoice)}
  transparent
  animationType="fade"
  onRequestClose={closePhotoSaveSheet}
>
  <View style={styles.photoChoiceBackdrop}>
    <View style={styles.photoChoiceSheet}>
      <View style={styles.photoChoiceHeader}>
        <Text style={styles.photoChoiceTitle}>Photo Options</Text>
        <TouchableOpacity
          style={styles.photoChoiceClose}
          onPress={closePhotoSaveSheet}
          disabled={savingDevicePhoto}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <X color={colors.text} size={22} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.photoChoiceOption}
        onPress={savePhotoToDevice}
        disabled={savingDevicePhoto}
        activeOpacity={0.76}
        accessibilityRole="button"
        accessibilityLabel="Save selected session photo to your phone"
      >
        <View style={styles.photoChoiceIcon}>
          {savingDevicePhoto ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Download color={colors.primary} size={22} />
          )}
        </View>
        <View style={styles.photoChoiceText}>
          <Text style={styles.photoChoiceLabel}>Save Photo</Text>
          <Text style={styles.photoChoiceHint}>Save to camera roll</Text>
        </View>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

- [ ] **Step 7: Run the active-photo-save test**

Run:

```bash
npm run test:active-photo-save
```

Expected: `PASS` with `active session photo save checks passed`.

- [ ] **Step 8: Commit the UI wiring**

```bash
git add src/screens/RecordScreen.tsx
git commit -m "feat: save active session photos locally"
```

## Task 5: Final Verification

**Files:**
- Verify: `scripts/activeSessionPhotoSave.test.js`
- Verify: `scripts/sessionPhotos.test.js`
- Verify: TypeScript project

- [ ] **Step 1: Run the focused save test**

```bash
npm run test:active-photo-save
```

Expected: `PASS` with `active session photo save checks passed`.

- [ ] **Step 2: Run the existing session photo regression test**

```bash
npm run test:session-photos
```

Expected: `PASS` with `session photo helpers tests passed`.

- [ ] **Step 3: Run TypeScript verification**

```bash
npx tsc --noEmit
```

Expected: exit code `0`.

- [ ] **Step 4: Check git status**

```bash
git status --short
```

Expected: no unintended changes outside `package.json`, `package-lock.json`, `app.json`, `scripts/activeSessionPhotoSave.test.js`, `src/lib/devicePhotoSave.ts`, `src/screens/RecordScreen.tsx`, and this plan file.
