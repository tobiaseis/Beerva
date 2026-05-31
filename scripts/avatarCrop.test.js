const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
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
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const {
  getAvatarCropLayout,
  getAvatarCropRect,
  clampAvatarZoom,
  MIN_AVATAR_CROP_ZOOM,
  MAX_AVATAR_CROP_ZOOM,
} = loadTypeScriptModule('src/lib/avatarCrop.ts');

const centeredLandscape = getAvatarCropRect({
  sourceWidth: 1200,
  sourceHeight: 800,
  frameSize: 300,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
});

assert.deepEqual(
  centeredLandscape,
  { originX: 200, originY: 0, width: 800, height: 800 },
  'a landscape image should start with a centered square crop'
);

assert.deepEqual(
  getAvatarCropRect({
    sourceWidth: 1200,
    sourceHeight: 800,
    frameSize: 300,
    zoom: 2,
    offsetX: 0,
    offsetY: 0,
  }),
  { originX: 400, originY: 200, width: 400, height: 400 },
  'zooming in should crop a smaller centered square from the source image'
);

assert.deepEqual(
  getAvatarCropRect({
    sourceWidth: 1200,
    sourceHeight: 800,
    frameSize: 300,
    zoom: 1,
    offsetX: -75,
    offsetY: 0,
  }),
  { originX: 400, originY: 0, width: 800, height: 800 },
  'dragging the image left should reveal the right side of the original photo'
);

assert.deepEqual(
  getAvatarCropRect({
    sourceWidth: 1200,
    sourceHeight: 800,
    frameSize: 300,
    zoom: 1,
    offsetX: -999,
    offsetY: 0,
  }),
  { originX: 400, originY: 0, width: 800, height: 800 },
  'crop offsets should clamp before they expose empty space'
);

assert.deepEqual(
  getAvatarCropRect({
    sourceWidth: 800,
    sourceHeight: 1200,
    frameSize: 300,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  }),
  { originX: 0, originY: 200, width: 800, height: 800 },
  'a portrait image should start with a centered square crop'
);

const layout = getAvatarCropLayout({
  sourceWidth: 1200,
  sourceHeight: 800,
  frameSize: 300,
  zoom: 1,
  offsetX: 999,
  offsetY: 999,
});

assert.equal(layout.offsetX, 75, 'preview layout should clamp horizontal pan to the image edge');
assert.equal(layout.offsetY, 0, 'preview layout should clamp vertical pan when image height already matches the frame');
assert.equal(layout.imageWidth, 450, 'preview layout should scale the image to cover the crop frame');
assert.equal(layout.imageHeight, 300, 'preview layout should preserve the source aspect ratio');
assert.equal(layout.imageLeft, 0, 'preview image left position should reflect the clamped offset');
assert.equal(layout.imageTop, 0, 'preview image top position should reflect the clamped offset');

assert.equal(clampAvatarZoom(0.25), MIN_AVATAR_CROP_ZOOM, 'zoom should not go below the minimum');
assert.equal(clampAvatarZoom(99), MAX_AVATAR_CROP_ZOOM, 'zoom should not go above the maximum');

console.log('avatar crop geometry checks passed');
