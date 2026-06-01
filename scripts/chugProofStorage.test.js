const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/chugProofStorage.ts'), 'utf8');

assert.match(source, /CHUG_VIDEO_BUCKET = 'chug_videos'/, 'chug proof storage should use the private chug_videos bucket');
assert.match(source, /export const chugVideoFromPickerAsset/, 'storage helper should convert picker assets');
assert.match(source, /export const uploadChugProofVideo/, 'storage helper should upload proof videos');
assert.match(source, /export const createChugProofSignedUrl/, 'storage helper should create temporary signed URLs');
assert.match(source, /sb_publishable_s-eJ6PwDoAIjnVlAH_ul1w_E3sgmM9v/, 'native uploads should reuse the existing Supabase publishable key');

console.log('chug proof storage checks passed');
