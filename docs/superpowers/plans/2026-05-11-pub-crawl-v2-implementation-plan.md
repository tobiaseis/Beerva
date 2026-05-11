# Pub Crawl Design v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the Pub Crawl feed cards to be structurally consistent with standard feed posts, add a pressable image viewer modal to all feed posts, move the convert to pub crawl button in the Record screen, and upgrade the crawl map route to use the real walking path.

**Architecture:** 
- `PubCrawlFeedCard` will use the same header (avatar, username, time) and footer (cheers/comments) as `FeedSessionCard`.
- `PubCrawlFeedCard` will display a badge indicating it's a "Pub Crawl".
- A global `ImageViewerModal` component will be created to expand pressed images to a larger screen overlay. This will be integrated into both `PubCrawlFeedCard` and `FeedSessionCard` / `FeedScreen`.
- `RecordScreen` will have its "Turn into Pub Crawl" button repositioned to the top of the view.
- `PubCrawlRouteMap` will be updated to fetch routes using the OSRM free routing API (`router.project-osrm.org`) with straight-line fallback.
- `package.json` needs no new packages; we'll use React Native's `Modal` and standard Image / UI tools.

**Tech Stack:** React Native, Expo, Supabase (for API data fetch, though OSRM will be a direct `fetch`), Lucide React Native (icons)

---

### Task 1: Reposition "Turn into Pub Crawl" button in RecordScreen

**Files:**
- Modify: `src/screens/RecordScreen.tsx`

- [ ] **Step 1: Move the conversion button**
Find the "Turn into Pub Crawl" `<AppButton>` (around lines where it checks `!activeCrawl`). Move this button to the top of the active session view, right above or alongside the current active pub title/info, ensuring it maintains its styling/margin.

```tsx
------- SEARCH
              {activeCrawl ? (
                <AppButton label="End Pub Crawl" onPress={handleEndPubCrawl} loading={crawlBusy && photoWarningAction !== 'end'} />
              ) : (
                <AppButton
                  label="Turn into Pub Crawl"
                  variant="secondary"
                  onPress={turnIntoPubCrawl}
                  loading={convertingCrawl}
                />
              )}
=======
              {activeCrawl && (
                <AppButton label="End Pub Crawl" onPress={handleEndPubCrawl} loading={crawlBusy && photoWarningAction !== 'end'} />
              )}
+++++++ REPLACE
```

```tsx
------- SEARCH
              <Text style={styles.activeTitle}>At {activeCrawl ? activeCrawl.activeStop?.pub?.name : activeSession.pub_name}</Text>
=======
              {!activeCrawl && (
                <AppButton
                  label="Turn into Pub Crawl"
                  variant="secondary"
                  onPress={turnIntoPubCrawl}
                  loading={convertingCrawl}
                  style={{ marginBottom: 16 }}
                />
              )}
              <Text style={styles.activeTitle}>At {activeCrawl ? activeCrawl.activeStop?.pub?.name : activeSession.pub_name}</Text>
+++++++ REPLACE
```
*(Adjust the SEARCH block to match exactly where the button is currently located and where the activeTitle is rendered).*

### Task 2: Create ImageViewerModal Component

**Files:**
- Create: `src/components/ImageViewerModal.tsx`

- [ ] **Step 1: Implement the Modal component**
Create a new file `src/components/ImageViewerModal.tsx`.

```tsx
import React from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { X } from 'lucide-react-native';
import { CachedImage } from './CachedImage';
import { colors } from '../theme/colors';

type Props = {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
};

export const ImageViewerModal = ({ visible, imageUrl, onClose }: Props) => {
  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X color={colors.white} size={28} />
          </TouchableOpacity>
        </View>
        <View style={styles.imageContainer}>
          <CachedImage
            uri={imageUrl}
            style={styles.image}
            contentFit="contain"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    zIndex: 10,
  },
  closeButton: {
    padding: 8,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
```

### Task 3: Add Image Viewing to Normal Feed Posts

**Files:**
- Modify: `src/screens/FeedScreen.tsx`

- [ ] **Step 1: Add state to FeedScreen**
Add state to track the currently viewed image URL.

```tsx
------- SEARCH
  const [commentDraft, setCommentDraft] = useState('');
=======
  const [commentDraft, setCommentDraft] = useState('');
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
+++++++ REPLACE
```

- [ ] **Step 2: Add ImageViewerModal to FeedScreen**
Import and add the modal to the bottom of `FeedScreen`.

```tsx
------- SEARCH
import { TrophyUnlockModal } from '../components/TrophyUnlockModal';
=======
import { TrophyUnlockModal } from '../components/TrophyUnlockModal';
import { ImageViewerModal } from '../components/ImageViewerModal';
+++++++ REPLACE
```

```tsx
------- SEARCH
          </Modal>
        );
      }
    }
  }, [commentingSession, currentUserId, commentDraft, submittingComment, closeComments, submitComment]);

  return (
=======
          </Modal>
        );
      }
    }
  }, [commentingSession, currentUserId, commentDraft, submittingComment, closeComments, submitComment]);

  return (
    <>
      <ImageViewerModal
        visible={!!viewingImageUrl}
        imageUrl={viewingImageUrl}
        onClose={() => setViewingImageUrl(null)}
      />
+++++++ REPLACE
```

```tsx
------- SEARCH
    </View>
  );
};
=======
    </View>
    </>
  );
};
+++++++ REPLACE
```

- [ ] **Step 3: Make FeedSession images pressable**
Update `FeedSessionCard` (in `FeedScreen.tsx` or its separate file if it is extracted) to open the modal on image press. Ensure `onImagePress` is passed to the component if needed. Since `FeedSessionCard` is defined in `FeedScreen.tsx`, we can use `Pressable`.

```tsx
------- SEARCH
          <View style={styles.imageWrap}>
            <CachedImage
              uri={item.image_url}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
          </View>
=======
          <Pressable style={styles.imageWrap} onPress={() => setViewingImageUrl(item.image_url)}>
            <CachedImage
              uri={item.image_url}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
+++++++ REPLACE
```

### Task 4: Standardize PubCrawlFeedCard Header and Footer

**Files:**
- Modify: `src/components/PubCrawlFeedCard.tsx`
- Modify: `src/components/PubCrawlMediaCarousel.tsx`

- [ ] **Step 1: Update PubCrawlFeedCard Header/Footer layout**
We need to use the avatar, username, and time formatting (similar to `FeedSessionCard`). Import necessary components (`CachedImage`, `lucide-react-native` icons, `formatRelativeTime`).

*(Self-review: we'll check how `FeedSessionCard` renders headers and footers and replicate that structure in `PubCrawlFeedCard`. Ensure we add an 'onImagePress' prop to pass down to `PubCrawlMediaCarousel` for image viewing).*

```tsx
------- SEARCH
export const PubCrawlFeedCard = ({ crawl, currentUserId, onToggleCheer, onOpenComments }: Props) => {
=======
export const PubCrawlFeedCard = ({ crawl, currentUserId, onToggleCheer, onOpenComments, onImagePress }: Props & { onImagePress?: (url: string) => void }) => {
+++++++ REPLACE
```

```tsx
------- SEARCH
        <PubCrawlMediaCarousel crawl={crawl} />
=======
        <PubCrawlMediaCarousel crawl={crawl} onImagePress={onImagePress} />
+++++++ REPLACE
```

*(Note for agent executing: Copy the header/footer structure from `FeedSessionCard` in `FeedScreen.tsx` and apply it to `PubCrawlFeedCard.tsx`. Ensure the "Pub Crawl" indicator is visible in the header or as an absolute positioned badge. Add a prop `onImagePress` to `PubCrawlFeedCard` and `PubCrawlMediaCarousel` to wire up the image viewer modal).*

### Task 5: Implement Image Pressing in PubCrawlMediaCarousel

**Files:**
- Modify: `src/components/PubCrawlMediaCarousel.tsx`

- [ ] **Step 1: Add onImagePress prop and handler**
Wrap the `CachedImage` in a `Pressable` that triggers `onImagePress`.

```tsx
------- SEARCH
              <CachedImage
                uri={(slide as any).imageUrl}
                style={{ width: SLIDE_WIDTH, height: SLIDE_WIDTH * 0.75 }}
                contentFit="cover"
                transition={200}
              />
=======
              <Pressable onPress={() => onImagePress?.((slide as any).imageUrl)}>
                <CachedImage
                  uri={(slide as any).imageUrl}
                  style={{ width: SLIDE_WIDTH, height: SLIDE_WIDTH * 0.75 }}
                  contentFit="cover"
                  transition={200}
                />
              </Pressable>
+++++++ REPLACE
```

- [ ] **Step 2: Pass down from FeedScreen**
Update the rendering of `PubCrawlFeedCard` in `FeedScreen.tsx` to pass the image press handler.

```tsx
------- SEARCH
        <PubCrawlFeedCard
          crawl={item.crawl}
          currentUserId={currentUserId!}
          onToggleCheer={toggleCrawlCheers}
          onOpenComments={(crawl) => setCommentingSession(crawl)}
        />
=======
        <PubCrawlFeedCard
          crawl={item.crawl}
          currentUserId={currentUserId!}
          onToggleCheer={toggleCrawlCheers}
          onOpenComments={(crawl) => setCommentingSession(crawl)}
          onImagePress={(url) => setViewingImageUrl(url)}
        />
+++++++ REPLACE
```

### Task 6: Implement Map Enhancements (OSRM Routing)

**Files:**
- Modify: `src/components/PubCrawlRouteMap.tsx`

- [ ] **Step 1: Fetch polyline from OSRM**
Add a `useEffect` to fetch the route geometry if there are 2 or more mapped stops.

```tsx
------- SEARCH
import { PubCrawlStop } from '../lib/pubCrawls';
import { getStaticMapViewport } from '../lib/staticRouteMap';
=======
import { useEffect, useState } from 'react';
import { PubCrawlStop } from '../lib/pubCrawls';
import { getStaticMapViewport } from '../lib/staticRouteMap';
import polyline from '@mapbox/polyline'; // Make sure this is imported if available, or write a simple decoder
+++++++ REPLACE
```
*(Note for agent: If `@mapbox/polyline` is not in package.json, fetch the GeoJSON directly instead of polyline. OSRM can return GeoJSON via `geometries=geojson` param).*

```tsx
------- SEARCH
export const PubCrawlRouteMap = ({ stops, width = 640, height = 420 }: Props) => {
  const viewport = useMemo(() => getStaticMapViewport(stops, { width, height }), [stops, width, height]);
=======
export const PubCrawlRouteMap = ({ stops, width = 640, height = 420 }: Props) => {
  const viewport = useMemo(() => getStaticMapViewport(stops, { width, height }), [stops, width, height]);
  const [routeCoordinates, setRouteCoordinates] = useState<string | null>(null); // SVG Path string

  useEffect(() => {
    const fetchRoute = async () => {
      const mappedStops = stops.filter(s => typeof s.pub?.latitude === 'number' && typeof s.pub?.longitude === 'number');
      if (mappedStops.length < 2) return;
      
      const coords = mappedStops.map(s => `${s.pub!.longitude},${s.pub!.latitude}`).join(';');
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/walking/${coords}?geometries=geojson&overview=full`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const geojsonCoords = data.routes[0].geometry.coordinates as [number, number][]; // [lon, lat][]
          
          // Convert GeoJSON coords to SVG path points using viewport scales
          if (viewport) {
             // You'll need to map these coords to the SVG viewport similar to how markers are mapped
             // The implementation of this requires mapping geojsonCoords to SVG coordinates using the same math `viewport` uses
             // ...
          }
        }
      } catch (err) {
        // Fallback: do nothing, leave routeCoordinates null
      }
    };
    fetchRoute();
  }, [stops, viewport]);
+++++++ REPLACE
```

- [ ] **Step 2: Render OSRM Route or Fallback Line**
In the SVG rendering part of `PubCrawlRouteMap`, check if we successfully generated `routeCoordinates` (the path string). If so, render an SVG `<Path>` or `<Polyline>` with those points. If not (the fallback), render the existing straight-line `<Polyline>`.

*(Note for executing agent: Since mapping arbitrary coordinates to the static viewport projection requires the same projection math, you'll need to ensure the fetched coordinates are properly scaled to the local SVG width/height. Look at how `getStaticMapViewport` creates `mappedStops` with local x/y values, and apply that same scale/translate math to the fetched GeoJSON coordinates. If this proves too complex for SVG without a mapping library, consider rendering straight lines as a fallback, but attempt the projection math first.)*

---
