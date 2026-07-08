const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260708160000_add_live_session_photo_preview.sql');
const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

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
  compiledModule.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return Module.prototype.require.call(compiledModule, request);
  };
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const main = async () => {
  assert.match(
    migrationSql,
    /create or replace function public\.get_live_session_photos\(target_session_id uuid\)/i,
    'migration should create the live session photo RPC'
  );
  assert.match(migrationSql, /returns table \(\s*id uuid,\s*session_id uuid,\s*image_url text,\s*is_keeper boolean,\s*expires_at timestamp with time zone,\s*created_at timestamp with time zone\s*\)/i, 'RPC should return session photo rows');
  assert.match(migrationSql, /security definer/i, 'RPC should run as security definer');
  assert.match(migrationSql, /set search_path = public/i, 'RPC should pin the search path');
  assert.match(migrationSql, /from public\.session_photos ph/i, 'RPC should read session_photos');
  assert.match(migrationSql, /join public\.live_mate_sessions live\s+on live\.session_id = ph\.session_id/i, 'RPC should require a current live row');
  assert.match(migrationSql, /live\.session_id = target_session_id/i, 'RPC should filter by the requested live session id');
  assert.match(migrationSql, /live\.user_id = \(select auth\.uid\(\)\)/i, 'RPC should allow the live session owner');
  assert.match(migrationSql, /follows\.follower_id = \(select auth\.uid\(\)\)[\s\S]*follows\.following_id = live\.user_id/i, 'RPC should allow followed live users');
  assert.match(migrationSql, /order by ph\.is_keeper desc nulls last,\s*ph\.created_at asc nulls last/i, 'RPC should return keeper-first photos');
  assert.match(migrationSql, /revoke execute on function public\.get_live_session_photos\(uuid\) from public, anon/i, 'anon and public should not execute the RPC');
  assert.match(migrationSql, /grant execute on function public\.get_live_session_photos\(uuid\) to authenticated/i, 'authenticated users should execute the RPC');
  assert.match(migrationSql, /notify pgrst, 'reload schema'/i, 'migration should reload PostgREST schema cache');

  let rpcCall = null;
  const liveMateSessions = loadTypeScriptModule('src/lib/liveMateSessions.ts', {
    './supabase': {
      supabase: {
        rpc: async (name, args) => {
          rpcCall = { name, args };
          return {
            data: [
              {
                id: 'photo-1',
                session_id: 'session-1',
                image_url: 'https://example.com/live.jpg',
                is_keeper: true,
                expires_at: null,
                created_at: '2026-07-08T16:00:00Z',
              },
            ],
            error: null,
          };
        },
      },
    },
  });

  assert.equal(typeof liveMateSessions.mapLiveSessionPhotoRow, 'function', 'client should export a live photo mapper');
  assert.deepEqual(
    liveMateSessions.mapLiveSessionPhotoRow({
      id: 'photo-2',
      session_id: 'session-2',
      image_url: 'https://example.com/two.jpg',
      is_keeper: false,
      expires_at: '2026-07-09T16:00:00Z',
      created_at: '2026-07-08T16:10:00Z',
    }),
    {
      id: 'photo-2',
      session_id: 'session-2',
      image_url: 'https://example.com/two.jpg',
      is_keeper: false,
      expires_at: '2026-07-09T16:00:00Z',
      created_at: '2026-07-08T16:10:00Z',
    },
    'mapper should normalize RPC rows to SessionPhoto shape'
  );
  assert.deepEqual(
    liveMateSessions.mapLiveSessionPhotoRow({
      id: '  ',
      session_id: '',
      image_url: null,
      is_keeper: null,
      expires_at: '',
      created_at: null,
    }),
    {
      id: '',
      session_id: null,
      image_url: '',
      is_keeper: false,
      expires_at: null,
      created_at: null,
    },
    'mapper should tolerate nullish and blank values'
  );

  const photos = await liveMateSessions.fetchLiveSessionPhotos('session-1');
  assert.deepEqual(rpcCall, {
    name: 'get_live_session_photos',
    args: { target_session_id: 'session-1' },
  }, 'fetch helper should call the live photo RPC with the selected session id');
  assert.equal(photos.length, 1, 'fetch helper should return mapped photos');
  assert.equal(photos[0].image_url, 'https://example.com/live.jpg', 'fetch helper should preserve image URLs');
  assert.deepEqual(await liveMateSessions.fetchLiveSessionPhotos('   '), [], 'blank session ids should return an empty list');

  const liveApiSource = fs.readFileSync(path.join(root, 'src/lib/liveMateSessions.ts'), 'utf8');
  assert.match(liveApiSource, /rpc\('get_live_session_photos',\s*\{ target_session_id: cleanSessionId \}\)/, 'client should use the RPC access path');
  assert.doesNotMatch(liveApiSource, /\.from\('session_photos'\)/, 'live preview client should not select session_photos directly');

  const liveSheetSource = fs.readFileSync(path.join(root, 'src/components/LiveMateSessionsSheet.tsx'), 'utf8');
  assert.match(liveSheetSource, /onPreviewSession: \(session: LiveMateSession\) => void;/, 'live sheet should accept preview callback');
  assert.match(liveSheetSource, /onPreviewSession,\s*onClose/, 'live sheet should destructure preview callback');
  assert.match(liveSheetSource, /<TouchableOpacity\s+key=\{session\.id\}[\s\S]*onPress=\{\(\) => onPreviewSession\(session\)\}/, 'live rows should call preview callback when pressed');
  assert.match(liveSheetSource, /accessibilityRole="button"[\s\S]*accessibilityLabel=\{`Preview \$\{displayName\}'s live session photos`\}/, 'live rows should expose preview accessibility copy');
  assert.match(liveSheetSource, /activeOpacity=\{0\.82\}/, 'live rows should have a press state');

  const modalPath = path.join(root, 'src/components/LiveSessionPhotoPreviewModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'live photo preview modal should exist');
  const modalSource = fs.readFileSync(modalPath, 'utf8');
  assert.match(modalSource, /export const LiveSessionPhotoPreviewModal/, 'modal should export LiveSessionPhotoPreviewModal');
  assert.match(modalSource, /photos: SessionPhoto\[];/, 'modal should accept session photos');
  assert.match(modalSource, /loading: boolean;/, 'modal should accept loading state');
  assert.match(modalSource, /error: string \| null;/, 'modal should accept error state');
  assert.match(modalSource, /unavailable: boolean;/, 'modal should accept no-longer-live state');
  assert.match(modalSource, /getVisibleSessionPhotoUrls\(photos,\s*null\)/, 'modal should reuse visible photo URL rules');
  assert.match(modalSource, /No photos yet\./, 'modal should render the no-photo empty state');
  assert.match(modalSource, /This session is no longer live\./, 'modal should render no-longer-live state');
  assert.match(modalSource, /Try again/, 'modal should render retry copy');
  assert.match(modalSource, /ActivityIndicator/, 'modal should render a loading state');
  assert.match(modalSource, /CachedImage/, 'modal should render photos with CachedImage');
  assert.match(modalSource, /onScroll=\{handlePhotoScroll\}/, 'modal carousel should update active dot while scrolling');

  const feedScreenSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');
  assert.match(feedScreenSource, /fetchLiveSessionPhotos/, 'FeedScreen should import the photo fetch helper');
  assert.match(feedScreenSource, /LiveMateSession/, 'FeedScreen should use the live session type');
  assert.match(feedScreenSource, /SessionPhoto/, 'FeedScreen should use the SessionPhoto type');
  assert.match(feedScreenSource, /selectedLiveMateSession/, 'FeedScreen should keep selected live session state');
  assert.match(feedScreenSource, /livePhotoPreviewRequestIdRef/, 'FeedScreen should guard stale preview fetches');
  assert.match(feedScreenSource, /fetchLiveSessionPhotos\(session\.sessionId\)/, 'FeedScreen should fetch photos on row press');
  assert.match(feedScreenSource, /setLivePhotoPreviewVisible\(true\)/, 'FeedScreen should open the preview immediately');
  assert.match(feedScreenSource, /onPreviewSession=\{openLiveSessionPreview\}/, 'FeedScreen should pass preview callback into live sheet');
  assert.match(feedScreenSource, /<LiveSessionPhotoPreviewModal/, 'FeedScreen should mount the preview modal');
  assert.match(feedScreenSource, /liveMateSessions\.some\(\(session\) => session\.sessionId === selectedLiveMateSession\.sessionId\)/, 'FeedScreen should detect when the selected live session disappears');
  assert.match(feedScreenSource, /setLivePhotoPreviewVisible\(false\)/, 'FeedScreen should close the preview when needed');
};

main()
  .then(() => {
    console.log('live session photo preview checks passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
