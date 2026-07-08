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
