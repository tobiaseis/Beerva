# Live Session Photo Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a follower-gated live-session photo preview that opens from the existing live-mates sheet and shows either uploaded active-session photos or "No photos yet."

**Architecture:** Keep the live roster lightweight and fetch photos on row tap through a new viewer-aware Supabase RPC. The client adds a small fetch helper, makes live rows pressable, renders a dedicated preview modal, and wires FeedScreen state so stale fetches and ended live sessions do not leak into the UI.

**Tech Stack:** Expo React Native, TypeScript, Supabase SQL/RPC, existing Node assertion scripts, existing Beerva theme/components.

---

## File Structure

- Create `supabase/migrations/20260708160000_add_live_session_photo_preview.sql`
  - Defines `public.get_live_session_photos(target_session_id uuid)`.
  - Enforces "currently live and followed or own" visibility through `live_mate_sessions`.
- Create `scripts/liveSessionPhotoPreview.test.js`
  - Source-level TDD checks for the migration, client helper, sheet pressability, modal, and FeedScreen wiring.
- Modify `package.json`
  - Add `test:live-session-preview`.
- Modify `src/lib/liveMateSessions.ts`
  - Add live-session photo row mapper and `fetchLiveSessionPhotos`.
- Modify `src/components/LiveMateSessionsSheet.tsx`
  - Add `onPreviewSession` prop and make rows pressable.
- Create `src/components/LiveSessionPhotoPreviewModal.tsx`
  - Render loading, photos, empty, retry, and no-longer-live states.
- Modify `src/screens/FeedScreen.tsx`
  - Own selected live session state, fetch photos on tap, and mount the preview modal.

---

### Task 1: Add The Failing Live Preview Test

**Files:**
- Create: `scripts/liveSessionPhotoPreview.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

In `package.json`, add this entry inside `"scripts"` next to the other `test:*` commands:

```json
"test:live-session-preview": "node scripts/liveSessionPhotoPreview.test.js"
```

- [ ] **Step 2: Write the failing test script**

Create `scripts/liveSessionPhotoPreview.test.js` with this complete content:

```javascript
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
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
npm run test:live-session-preview
```

Expected: `FAIL` with an assertion mentioning the missing `get_live_session_photos` migration or missing `mapLiveSessionPhotoRow`.

- [ ] **Step 4: Commit the failing test**

```bash
git add package.json scripts/liveSessionPhotoPreview.test.js
git commit -m "test: cover live session photo preview"
```

---

### Task 2: Add The RPC And Client Fetch Helper

**Files:**
- Create: `supabase/migrations/20260708160000_add_live_session_photo_preview.sql`
- Modify: `src/lib/liveMateSessions.ts`
- Test: `scripts/liveSessionPhotoPreview.test.js`

- [ ] **Step 1: Add the database RPC**

Create `supabase/migrations/20260708160000_add_live_session_photo_preview.sql` with this complete content:

```sql
create or replace function public.get_live_session_photos(target_session_id uuid)
returns table (
  id uuid,
  session_id uuid,
  image_url text,
  is_keeper boolean,
  expires_at timestamp with time zone,
  created_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ph.id,
    ph.session_id,
    ph.image_url,
    ph.is_keeper,
    ph.expires_at,
    ph.created_at
  from public.session_photos ph
  join public.live_mate_sessions live
    on live.session_id = ph.session_id
  where live.session_id = target_session_id
    and (
      live.user_id = (select auth.uid())
      or exists (
        select 1
        from public.follows
        where follows.follower_id = (select auth.uid())
          and follows.following_id = live.user_id
      )
    )
  order by ph.is_keeper desc nulls last, ph.created_at asc nulls last;
$$;

revoke execute on function public.get_live_session_photos(uuid) from public, anon;
grant execute on function public.get_live_session_photos(uuid) to authenticated;

comment on function public.get_live_session_photos(uuid) is
  'Returns active-session photos for a live session when the current viewer owns or follows the live user.';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Add the client mapper and fetch helper**

In `src/lib/liveMateSessions.ts`, add this import at the top:

```typescript
import type { SessionPhoto } from './sessionPhotos';
```

Add this row type after `type LiveMateSessionRow`:

```typescript
type LiveSessionPhotoRow = {
  id?: string | null;
  session_id?: string | null;
  image_url?: string | null;
  is_keeper?: boolean | null;
  expires_at?: string | null;
  created_at?: string | null;
};
```

Add these exports after `fetchLiveMateSessions`:

```typescript
export const mapLiveSessionPhotoRow = (row: LiveSessionPhotoRow): SessionPhoto => ({
  id: toCleanString(row.id) || '',
  session_id: toCleanString(row.session_id),
  image_url: toCleanString(row.image_url) || '',
  is_keeper: row.is_keeper === true,
  expires_at: toCleanString(row.expires_at),
  created_at: toCleanString(row.created_at),
});

export const fetchLiveSessionPhotos = async (sessionId: string): Promise<SessionPhoto[]> => {
  const cleanSessionId = toCleanString(sessionId);
  if (!cleanSessionId) return [];

  const { data, error } = await supabase.rpc('get_live_session_photos', { target_session_id: cleanSessionId });
  if (error) throw error;

  return ((data || []) as LiveSessionPhotoRow[])
    .map(mapLiveSessionPhotoRow)
    .filter((photo) => photo.id && photo.image_url);
};
```

- [ ] **Step 3: Run the preview test and verify the data/API section passes while UI checks still fail**

Run:

```bash
npm run test:live-session-preview
```

Expected: `FAIL` on the first missing UI assertion, such as `live sheet should accept preview callback`.

- [ ] **Step 4: Commit the RPC and helper**

```bash
git add supabase/migrations/20260708160000_add_live_session_photo_preview.sql src/lib/liveMateSessions.ts
git commit -m "feat: add live session photo rpc"
```

---

### Task 3: Make Live Mate Rows Pressable

**Files:**
- Modify: `src/components/LiveMateSessionsSheet.tsx`
- Test: `scripts/liveSessionPhotoPreview.test.js`

- [ ] **Step 1: Update the props and component signature**

In `src/components/LiveMateSessionsSheet.tsx`, replace the props type and function signature with:

```typescript
type LiveMateSessionsSheetProps = {
  visible: boolean;
  sessions: LiveMateSession[];
  onPreviewSession: (session: LiveMateSession) => void;
  onClose: () => void;
};

export const LiveMateSessionsSheet = ({
  visible,
  sessions,
  onPreviewSession,
  onClose,
}: LiveMateSessionsSheetProps) => {
```

- [ ] **Step 2: Replace the live row wrapper with a pressable row**

In the `sessions.map` block, replace the outer row `<View>` and closing `</View>` with this `TouchableOpacity` wrapper:

```tsx
<TouchableOpacity
  key={session.id}
  style={styles.row}
  onPress={() => onPreviewSession(session)}
  activeOpacity={0.82}
  accessibilityRole="button"
  accessibilityLabel={`Preview ${displayName}'s live session photos`}
  accessibilityHint="Opens photos uploaded to this active drinking session."
>
  <CachedImage
    uri={session.avatarUrl}
    fallbackUri={`https://i.pravatar.cc/150?u=${session.userId}`}
    recyclingKey={`live-mate-${session.userId}-${session.avatarUrl || 'fallback'}`}
    style={styles.avatar}
    accessibilityLabel={`${displayName}'s avatar`}
  />
  <View style={styles.rowCopy}>
    <View style={styles.nameLine}>
      <Text style={styles.username} numberOfLines={1}>{displayName}</Text>
      {session.isPubCrawl ? (
        <View style={styles.crawlPill}>
          <Route color={colors.primary} size={11} />
          <Text style={styles.crawlPillText}>Pub crawl</Text>
        </View>
      ) : null}
    </View>
    <View style={styles.pubLine}>
      <MapPin color={colors.textMuted} size={13} />
      <Text style={styles.pubName} numberOfLines={1}>{pubName}</Text>
    </View>
  </View>
  <View style={styles.stats}>
    <Text style={styles.truePints}>{formatLiveTruePints(session.truePints)}</Text>
    <Text style={styles.elapsed}>{formatLiveStartedLabel(session.startedAt)}</Text>
  </View>
</TouchableOpacity>
```

- [ ] **Step 3: Run the preview test and verify the next missing assertion is the modal**

Run:

```bash
npm run test:live-session-preview
```

Expected: `FAIL` with `live photo preview modal should exist`.

- [ ] **Step 4: Commit the pressable live rows**

```bash
git add src/components/LiveMateSessionsSheet.tsx
git commit -m "feat: make live mate rows previewable"
```

---

### Task 4: Add The Live Photo Preview Modal

**Files:**
- Create: `src/components/LiveSessionPhotoPreviewModal.tsx`
- Test: `scripts/liveSessionPhotoPreview.test.js`

- [ ] **Step 1: Create the modal component**

Create `src/components/LiveSessionPhotoPreviewModal.tsx` with this complete content:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ImageOff, RefreshCw, X } from 'lucide-react-native';

import { getLiveMateDisplayName, LiveMateSession } from '../lib/liveMateSessions';
import { getVisibleSessionPhotoUrls, SessionPhoto } from '../lib/sessionPhotos';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { CachedImage } from './CachedImage';

const MAX_MODAL_WIDTH = 540;
const HORIZONTAL_MARGIN = 24;

type LiveSessionPhotoPreviewModalProps = {
  visible: boolean;
  session: LiveMateSession | null;
  photos: SessionPhoto[];
  loading: boolean;
  error: string | null;
  unavailable: boolean;
  onRetry: () => void;
  onClose: () => void;
};

export const LiveSessionPhotoPreviewModal = ({
  visible,
  session,
  photos,
  loading,
  error,
  unavailable,
  onRetry,
  onClose,
}: LiveSessionPhotoPreviewModalProps) => {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const displayName = getLiveMateDisplayName(session || { username: null });
  const photoUrls = useMemo(() => getVisibleSessionPhotoUrls(photos, null), [photos]);
  const modalWidth = Math.min(windowWidth - HORIZONTAL_MARGIN * 2, MAX_MODAL_WIDTH);
  const slideWidth = Math.max(260, modalWidth - 32);
  const slideHeight = Math.round(slideWidth * 1.12);

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [session?.sessionId, photoUrls.join('|')]);

  const handlePhotoScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / slideWidth);
    const clampedIndex = Math.max(0, Math.min(index, photoUrls.length - 1));
    setActivePhotoIndex((currentIndex) => currentIndex === clampedIndex ? currentIndex : clampedIndex);
  };

  const renderContent = () => {
    if (unavailable) {
      return (
        <View style={styles.stateBlock}>
          <ImageOff color={colors.textMuted} size={30} />
          <Text style={styles.stateTitle}>This session is no longer live.</Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.stateBlock}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.stateText}>Loading photos...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateBlock}>
          <ImageOff color={colors.textMuted} size={30} />
          <Text style={styles.stateTitle}>Could not load photos.</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Try again loading live session photos"
          >
            <RefreshCw color={colors.background} size={16} />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (photoUrls.length === 0) {
      return (
        <View style={styles.stateBlock}>
          <ImageOff color={colors.textMuted} size={30} />
          <Text style={styles.stateTitle}>No photos yet.</Text>
        </View>
      );
    }

    return (
      <View style={[styles.carouselWrap, { height: slideHeight }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handlePhotoScroll}
          onMomentumScrollEnd={handlePhotoScroll}
          scrollEventThrottle={16}
          snapToInterval={slideWidth}
          decelerationRate="fast"
          style={styles.scroller}
        >
          {photoUrls.map((imageUrl, index) => (
            <View
              key={`${session?.sessionId || 'live'}-${imageUrl}`}
              style={[styles.slide, { width: slideWidth, height: slideHeight }]}
            >
              <CachedImage
                uri={imageUrl}
                style={styles.image}
                recyclingKey={`live-preview-${session?.sessionId || 'unknown'}-${index}-${imageUrl}`}
                accessibilityLabel={`${displayName}'s live session photo ${index + 1}`}
              />
            </View>
          ))}
        </ScrollView>
        {photoUrls.length > 1 ? (
          <View pointerEvents="none" style={styles.dots}>
            {photoUrls.map((imageUrl, index) => (
              <View
                key={`dot-${imageUrl}`}
                style={[styles.dot, index === activePhotoIndex ? styles.dotActive : null]}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.card, { width: modalWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Live preview</Text>
              <Text style={styles.title} numberOfLines={1}>{displayName}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Close live session photo preview"
            >
              <X color={colors.textMuted} size={18} />
            </TouchableOpacity>
          </View>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.66)',
  },
  card: {
    maxHeight: '86%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    ...shadows.raised,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  stateBlock: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  stateTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  stateText: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryButton: {
    minHeight: 38,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '900',
  },
  carouselWrap: {
    position: 'relative',
    backgroundColor: colors.cardMuted,
  },
  scroller: {
    width: '100%',
    height: '100%',
  },
  slide: {
    backgroundColor: colors.cardMuted,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.cardMuted,
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(248, 250, 252, 0.52)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
```

- [ ] **Step 2: Run the preview test and verify FeedScreen assertions fail**

Run:

```bash
npm run test:live-session-preview
```

Expected: `FAIL` with a FeedScreen assertion such as `FeedScreen should import the photo fetch helper`.

- [ ] **Step 3: Commit the modal**

```bash
git add src/components/LiveSessionPhotoPreviewModal.tsx
git commit -m "feat: add live photo preview modal"
```

---

### Task 5: Wire FeedScreen Fetch-On-Tap Preview

**Files:**
- Modify: `src/screens/FeedScreen.tsx`
- Test: `scripts/liveSessionPhotoPreview.test.js`

- [ ] **Step 1: Update imports**

In `src/screens/FeedScreen.tsx`, replace:

```typescript
import { LiveMateSessionsSheet } from '../components/LiveMateSessionsSheet';
```

with:

```typescript
import { LiveMateSessionsSheet } from '../components/LiveMateSessionsSheet';
import { LiveSessionPhotoPreviewModal } from '../components/LiveSessionPhotoPreviewModal';
```

Replace:

```typescript
import {
  getAllSessionPhotoUrls,
  getVisibleSessionPhotoUrls,
} from '../lib/sessionPhotos';
```

with:

```typescript
import {
  getAllSessionPhotoUrls,
  getVisibleSessionPhotoUrls,
  SessionPhoto,
} from '../lib/sessionPhotos';
```

Add this import below the existing `useLiveMateSessions` import:

```typescript
import {
  fetchLiveSessionPhotos,
  LiveMateSession,
} from '../lib/liveMateSessions';
```

- [ ] **Step 2: Add preview state and request guard**

After:

```typescript
const [liveMateSheetVisible, setLiveMateSheetVisible] = useState(false);
const { sessions: liveMateSessions, refresh: refreshLiveMateSessions } = useLiveMateSessions();
```

add:

```typescript
const [livePhotoPreviewVisible, setLivePhotoPreviewVisible] = useState(false);
const [selectedLiveMateSession, setSelectedLiveMateSession] = useState<LiveMateSession | null>(null);
const [livePhotoPreviewPhotos, setLivePhotoPreviewPhotos] = useState<SessionPhoto[]>([]);
const [livePhotoPreviewLoading, setLivePhotoPreviewLoading] = useState(false);
const [livePhotoPreviewError, setLivePhotoPreviewError] = useState<string | null>(null);
const livePhotoPreviewRequestIdRef = useRef(0);
```

- [ ] **Step 3: Add fetch, open, retry, close, and availability helpers**

Add this block before the existing `useEffect` that closes the live sheet when `liveMateSessions.length === 0`:

```typescript
const selectedLiveMateSessionStillLive = Boolean(
  selectedLiveMateSession
  && liveMateSessions.some((session) => session.sessionId === selectedLiveMateSession.sessionId)
);

const selectedLiveMateSessionUnavailable = Boolean(
  selectedLiveMateSession
  && liveMateSessions.length > 0
  && !selectedLiveMateSessionStillLive
);

const loadLiveSessionPhotos = useCallback(async (session: LiveMateSession) => {
  const requestId = livePhotoPreviewRequestIdRef.current + 1;
  livePhotoPreviewRequestIdRef.current = requestId;

  setLivePhotoPreviewLoading(true);
  setLivePhotoPreviewError(null);
  setLivePhotoPreviewPhotos([]);

  try {
    const photos = await fetchLiveSessionPhotos(session.sessionId);
    if (livePhotoPreviewRequestIdRef.current !== requestId) return;
    setLivePhotoPreviewPhotos(photos);
  } catch (error: any) {
    if (livePhotoPreviewRequestIdRef.current !== requestId) return;
    setLivePhotoPreviewError(getErrorMessage(error) || 'Please try again.');
  } finally {
    if (livePhotoPreviewRequestIdRef.current === requestId) {
      setLivePhotoPreviewLoading(false);
    }
  }
}, []);

const openLiveSessionPreview = useCallback((session: LiveMateSession) => {
  setSelectedLiveMateSession(session);
  setLivePhotoPreviewVisible(true);
  loadLiveSessionPhotos(session);
}, [loadLiveSessionPhotos]);

const closeLiveSessionPreview = useCallback(() => {
  livePhotoPreviewRequestIdRef.current += 1;
  setLivePhotoPreviewVisible(false);
  setSelectedLiveMateSession(null);
  setLivePhotoPreviewPhotos([]);
  setLivePhotoPreviewLoading(false);
  setLivePhotoPreviewError(null);
}, []);

const retryLiveSessionPreview = useCallback(() => {
  if (!selectedLiveMateSession || selectedLiveMateSessionUnavailable) return;
  loadLiveSessionPhotos(selectedLiveMateSession);
}, [loadLiveSessionPhotos, selectedLiveMateSession, selectedLiveMateSessionUnavailable]);
```

- [ ] **Step 4: Extend live-list cleanup**

Replace the existing live-list cleanup effect:

```typescript
useEffect(() => {
  if (liveMateSessions.length === 0) {
    setLiveMateSheetVisible(false);
  }
}, [liveMateSessions.length]);
```

with:

```typescript
useEffect(() => {
  if (liveMateSessions.length === 0) {
    setLiveMateSheetVisible(false);
    closeLiveSessionPreview();
  }
}, [closeLiveSessionPreview, liveMateSessions.length]);

useEffect(() => {
  if (!selectedLiveMateSession || selectedLiveMateSessionStillLive) return;

  livePhotoPreviewRequestIdRef.current += 1;
  setLivePhotoPreviewLoading(false);
  setLivePhotoPreviewError(null);
  setLivePhotoPreviewPhotos([]);
}, [selectedLiveMateSession, selectedLiveMateSessionStillLive]);
```

- [ ] **Step 5: Pass the preview callback into the live sheet**

Replace:

```tsx
<LiveMateSessionsSheet
  visible={liveMateSheetVisible}
  sessions={liveMateSessions}
  onClose={() => setLiveMateSheetVisible(false)}
/>
```

with:

```tsx
<LiveMateSessionsSheet
  visible={liveMateSheetVisible}
  sessions={liveMateSessions}
  onPreviewSession={openLiveSessionPreview}
  onClose={() => setLiveMateSheetVisible(false)}
/>
```

- [ ] **Step 6: Mount the preview modal**

Add this JSX immediately after the `LiveMateSessionsSheet`:

```tsx
<LiveSessionPhotoPreviewModal
  visible={livePhotoPreviewVisible}
  session={selectedLiveMateSession}
  photos={livePhotoPreviewPhotos}
  loading={livePhotoPreviewLoading}
  error={livePhotoPreviewError}
  unavailable={selectedLiveMateSessionUnavailable}
  onRetry={retryLiveSessionPreview}
  onClose={closeLiveSessionPreview}
/>
```

- [ ] **Step 7: Run the preview test and verify it passes**

Run:

```bash
npm run test:live-session-preview
```

Expected: `PASS` and output includes:

```text
live session photo preview checks passed
```

- [ ] **Step 8: Commit FeedScreen wiring**

```bash
git add src/screens/FeedScreen.tsx
git commit -m "feat: preview live session photos from feed"
```

---

### Task 6: Run Focused Regression Tests

**Files:**
- Verify: `scripts/liveSessionPhotoPreview.test.js`
- Verify: `scripts/liveMateSessions.test.js`
- Verify: `scripts/sessionPhotos.test.js`
- Verify: `scripts/feedHeader.test.js`

- [ ] **Step 1: Run the new preview test**

```bash
npm run test:live-session-preview
```

Expected: `PASS`.

- [ ] **Step 2: Run existing live-mates tests**

```bash
npm run test:live-mates
```

Expected: `PASS`.

- [ ] **Step 3: Run existing session photo tests**

```bash
npm run test:session-photos
```

Expected: `PASS`.

- [ ] **Step 4: Run existing feed header tests**

```bash
npm run test:feed-header
```

Expected: `PASS`.

- [ ] **Step 5: Run TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit any verification-only test adjustments**

If no files changed during verification, skip this commit. If a test assertion needed a wording update to match the implemented code while preserving the same behavior, commit only that test adjustment:

```bash
git add scripts/liveSessionPhotoPreview.test.js
git commit -m "test: tighten live session preview coverage"
```

---

### Task 7: Final Review

**Files:**
- Review: `supabase/migrations/20260708160000_add_live_session_photo_preview.sql`
- Review: `src/lib/liveMateSessions.ts`
- Review: `src/components/LiveMateSessionsSheet.tsx`
- Review: `src/components/LiveSessionPhotoPreviewModal.tsx`
- Review: `src/screens/FeedScreen.tsx`
- Review: `scripts/liveSessionPhotoPreview.test.js`

- [ ] **Step 1: Check git status**

```bash
git status --short
```

Expected: no uncommitted files, or only intentional files from the final task.

- [ ] **Step 2: Inspect the implementation diff**

```bash
git show --stat --oneline HEAD
```

Expected: latest commit contains only files for live session photo preview.

- [ ] **Step 3: Confirm the privacy path**

Read `supabase/migrations/20260708160000_add_live_session_photo_preview.sql` and confirm these three facts are true:

```text
1. The RPC joins public.live_mate_sessions before returning photos.
2. The RPC allows auth.uid() when it owns the live row.
3. The RPC allows auth.uid() when it follows live.user_id.
```

- [ ] **Step 4: Confirm fetch-on-tap behavior**

Read `src/screens/FeedScreen.tsx` and confirm these three facts are true:

```text
1. fetchLiveSessionPhotos(session.sessionId) is called only inside the row-preview flow.
2. LiveMateSessionsSheet receives liveMateSessions without photo data.
3. LiveSessionPhotoPreviewModal is mounted separately from the live roster.
```

- [ ] **Step 5: Final verification command**

Run:

```bash
npm run test:live-session-preview && npm run test:live-mates && npm run test:session-photos && npm run test:feed-header && npx tsc --noEmit
```

Expected: every command passes.
