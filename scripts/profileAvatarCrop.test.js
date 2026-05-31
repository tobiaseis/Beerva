const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

const profileScreenSource = readSource('src/screens/ProfileScreen.tsx');
const setupScreenSource = readSource('src/screens/ProfileSetupScreen.tsx');
const cropModalSource = readSource('src/components/AvatarCropModal.tsx');

assert.match(
  profileScreenSource,
  /AvatarCropModal/,
  'profile edit should render the shared avatar crop modal'
);

assert.match(
  setupScreenSource,
  /AvatarCropModal/,
  'profile setup should render the shared avatar crop modal'
);

assert.match(
  profileScreenSource,
  /allowsEditing:\s*false/,
  'profile edit should select the original image so Beerva controls the crop'
);

assert.match(
  setupScreenSource,
  /allowsEditing:\s*false/,
  'profile setup should select the original image so Beerva controls the crop'
);

assert.doesNotMatch(
  profileScreenSource,
  /allowsEditing:\s*true/,
  'profile edit should not rely on the platform cropper anymore'
);

assert.doesNotMatch(
  setupScreenSource,
  /allowsEditing:\s*true/,
  'profile setup should not rely on the platform cropper anymore'
);

assert.match(
  cropModalSource,
  /PanResponder\.create/,
  'avatar crop modal should let users pan the chosen photo inside the avatar circle'
);

assert.match(
  cropModalSource,
  /getAvatarCropRect/,
  'avatar crop modal should crop the saved image from the same geometry used by the preview'
);

assert.match(
  cropModalSource,
  /ImageManipulator\.manipulateAsync[\s\S]*crop:[\s\S]*resize:/,
  'native avatar crop should crop first and then resize the upload image'
);

assert.match(
  cropModalSource,
  /canvas\.toBlob/,
  'web avatar crop should export the cropped preview through canvas'
);

assert.match(
  cropModalSource,
  /borderRadius:\s*frameSize\s*\/\s*2/,
  'avatar crop preview should use a circular mask matching the profile avatar shape'
);

console.log('profile avatar crop checks passed');
