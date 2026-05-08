# Beerva PWA — Optimization & Professionalism Audit

After reviewing every screen, component, theme, service worker, and manifest in the codebase, here are concrete, prioritized recommendations grouped into **Functionality** and **Design/Polish**.

---

## 🚀 Functionality Optimizations

### 1. Offline-First Feed with Optimistic UI
**Priority: High · Effort: Medium**

Right now, if the network drops, the feed just shows a spinner. A professional PWA should:
- **Cache the last feed response** in `AsyncStorage` or `IndexedDB` and show it instantly on launch, then refresh from the network in the background (stale-while-revalidate for data, not just assets).
- **Optimistic session creation** — when the user saves a session on RecordScreen, immediately add it to the local feed state and navigate to Feed, then sync to Supabase in the background. Show a subtle toast on success/failure.

> [!TIP]
> You're already caching images via `expo-image` with `cachePolicy="disk"`. Extend this pattern to data by serializing the last `sessions` array to `AsyncStorage` under a key like `beerva:feed-cache`.

---

### 2. Skeleton Loading States (instead of spinners)
**Priority: High · Effort: Low**

Every screen currently shows a centered `<ActivityIndicator>` while loading. Professional apps use **skeleton placeholders** that mimic the layout of the content that will appear. This makes the app feel faster and more polished.

Create a `<SkeletonCard>` component (pulsing gray rectangles matching the card layout) and use it in:
- [FeedScreen.tsx](file:///c:/Users/User/Documents/AAU%2010.%20semester/Beerva/src/screens/FeedScreen.tsx) — show 3-4 skeleton cards while loading
- [PeopleScreen.tsx](file:///c:/Users/User/Documents/AAU%2010.%20semester/Beerva/src/screens/PeopleScreen.tsx) — skeleton user rows
- [ProfileScreen.tsx](file:///c:/Users/User/Documents/AAU%2010.%20semester/Beerva/src/screens/ProfileScreen.tsx) — skeleton avatar + stats

---

### 3. Haptic Feedback on Interactions
**Priority: Medium · Effort: Low**

Native apps use subtle haptic vibrations on key actions. Add `expo-haptics` for:
- Cheers button tap → `Haptics.impactAsync(ImpactFeedbackStyle.Medium)`
- Pull-to-refresh threshold → `Haptics.impactAsync(ImpactFeedbackStyle.Light)`
- Session saved → `Haptics.notificationAsync(NotificationFeedbackType.Success)`
- Delete confirmation → `Haptics.notificationAsync(NotificationFeedbackType.Warning)`

On web, the calls silently no-op, so it's safe to add everywhere.

---

### 4. Image Optimizations
**Priority: Medium · Effort: Low-Medium**

- **Blurhash placeholders**: When uploading a session image, generate a [blurhash](https://blurha.sh) and store it alongside `image_url` in the DB. Then use `expo-image`'s built-in `placeholder={{ blurhash }}` prop for instant blurred previews.
- **Progressive image loading**: `expo-image` already supports `transition={120}` — increase this to ~250ms and add a blurhash for a buttery smooth effect.
- **Image thumbnails**: Consider storing a small thumbnail (~200px wide) alongside the full image for feed cards, then load the full image only when a user taps to expand.

---

### 5. Session Detail / Expand View
**Priority: Medium · Effort: Medium**

Currently, feed posts are static cards with no tap-to-expand. Adding a **Session Detail** modal or screen would let users:
- See the full-resolution photo
- View full comment text (no truncation)
- See a map of the pub location (using the stored `pub_name` + a simple static map or MapView)
- Show session metadata: exact date/time, ABV, volume

This makes each session feel more substantial and gives the app depth.

---

### 6. App Update Flow
**Priority: Medium · Effort: Low**

Your service worker uses `skipWaiting()` on install, which force-activates immediately. This can cause stale assets to mix with fresh HTML. A more robust approach:

```js
// In sw.js — remove skipWaiting() from install
// Instead, in your app code:
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          // Show "New version available, tap to refresh" banner
        }
      });
    });
  });
}
```

---

### 7. Error Boundary & Retry Logic
**Priority: Medium · Effort: Low**

No error boundaries exist. A crash in any component takes down the entire app. Add a React error boundary at the root (in `App.tsx`) that shows a "Something went wrong — tap to reload" screen instead of a white screen.

Also, network calls in [FeedScreen.tsx](file:///c:/Users/User/Documents/AAU%2010.%20semester/Beerva/src/screens/FeedScreen.tsx) silently swallow errors with `console.error`. Show a retry banner when the feed fetch fails.

---

### 8. Smart Pub Search
**Priority: Low · Effort: Medium**

The current Nominatim search is country-locked to Denmark and appends "pub" to every query. Improvements:
- Use the browser's **Geolocation API** to bias results toward the user's actual location (Nominatim accepts `viewbox` and `bounded` parameters)
- Cache recent/frequent pubs per user in `AsyncStorage` and show them as "Recent" chips before search results load
- Remember the last-used pub and pre-fill it

---

## 🎨 Design & Professionalism

### 9. Splash Screen / Loading Brand Moment
**Priority: High · Effort: Low**

Right now the app shows a blank dark View while fonts load, then jumps directly to content. Add a **branded splash**:
- Show the Beerva logo (centered, large) with a subtle scale-up animation using `Animated` or `react-native-reanimated`
- Fade transition into the auth or feed screen
- Set a proper `splash` config in [app.json](file:///c:/Users/User/Documents/AAU%2010.%20semester/Beerva/app.json)

---

### 10. Screen Transitions & Micro-Animations
**Priority: High · Effort: Medium**

Currently all screen transitions are instant hard-cuts. Professional mobile apps use:
- **Shared element transitions** for profile avatars (feed → user profile)
- **Slide-up** for the Record screen (it's a creation flow)
- **Fade** for tab switches
- **Spring animations** on the cheers button (a brief scale-up bounce when tapped)

You can achieve this with `react-navigation`'s built-in animation configs or `react-native-reanimated`.

---

### 11. Typography & Font Hierarchy
**Priority: Medium · Effort: Low**

You load `Righteous_400Regular` but only use it for the logo text and high-score values. The rest of the app uses system fonts, which looks inconsistent across devices. Suggestions:
- Load a professional body font like **Inter** or **DM Sans** via `expo-google-fonts`
- Use it for all body text, making the app feel cohesive instead of relying on platform defaults
- `Righteous` stays for brand elements (logo, headings) creating a clear hierarchy

---

### 12. Empty States with Illustrations
**Priority: Medium · Effort: Low**

The current empty states are just text + an icon. Generate a few small illustrations/SVGs (beer glass tipping, friends clinking, trophy cabinet) for:
- Empty feed → illustration of friends drinking together
- Empty notifications → quiet beer mug
- Empty trophy cabinet → locked trophy illustration
- Empty search results → magnifying glass over a beer

These add personality and make the app feel finished rather than skeletal.

---

### 13. Floating Action Button for Record
**Priority: Medium · Effort: Low**

Replace the "Record" tab with a **floating action button (FAB)** centered above the tab bar with a prominent `+` icon and the accent gold color. This is a common pattern in social apps (Instagram, Twitter) and makes the primary action visually obvious and delightful.

The tab bar would have 4 tabs (Feed, People, Notifications, Profile) with the FAB floating above center.

---

### 14. Card Design Polish
**Priority: Medium · Effort: Low**

Current feed cards could feel more premium with these tweaks:
- **Rounded image corners** on the session photo (currently squared off at top/bottom)
- **Double-tap to cheer** — the Instagram pattern is instantly recognizable and satisfying
- **Animated cheers counter** — brief count-up animation when cheers changes
- **Time format**: "0 mins ago" for very recent posts should be "Just now"

---

### 15. Pull-to-Refresh Visual
**Priority: Low · Effort: Low**

Your custom web pull-to-refresh shows plain text ("Pull to refresh"). Replace this with:
- A small Beerva logo that rotates while refreshing
- Or a beer glass that "fills up" as you pull down

---

### 16. Tab Bar Badge for Notifications
**Priority: Low · Effort: Low**

You show unread count on the bell icon inside the Feed header, but the notification bell is a separate screen accessible only from Feed. Consider adding a badge dot on the tab bar itself (or if you adopt the FAB pattern, on the Notifications tab) so users see unread notifications from any screen.

---

### 17. Dark Mode Refinements
**Priority: Low · Effort: Low**

Your dark color palette is solid, but a few tweaks would elevate it:
- The `card` and `surface` colors (`#182335` and `#121A27`) are very close — increase contrast between nested surfaces
- Add a very subtle noise/grain texture to the background for depth (CSS `background-image` with a tiny repeating PNG)
- Consider a slightly warm-tinted background (shift toward amber) to match the beer brand identity

---

## 📦 PWA-Specific

### 18. Manifest Enhancements
**Priority: High · Effort: Low**

Your [manifest.json](file:///c:/Users/User/Documents/AAU%2010.%20semester/Beerva/public/manifest.json) is missing:
- `categories: ["social", "food", "lifestyle"]` — helps app store discovery
- `screenshots` array — required for the enhanced install prompt on Android
- `shortcuts` — deep links from home screen (e.g. "Record a Session", "View Feed")
- `share_target` — allow users to share photos directly to Beerva

```json
{
  "shortcuts": [
    {
      "name": "Record a Session",
      "url": "/?tab=record",
      "icons": [{ "src": "/beerva-icon-192.png", "sizes": "192x192" }]
    }
  ]
}
```

---

### 19. Service Worker: Cache JS/CSS Bundles
**Priority: High · Effort: Low**

Your [sw.js](file:///c:/Users/User/Documents/AAU%2010.%20semester/Beerva/public/sw.js) only pre-caches 4 URLs. The Expo-generated JS bundle and CSS aren't in the pre-cache list, so the app **won't work offline after first load**. Pre-cache the bundle files or use a runtime caching strategy that eagerly caches `/_expo/static/**` assets.

---

### 20. iOS PWA Polish
**Priority: Medium · Effort: Low**

iOS Safari PWAs have quirks. Add to [index.html](file:///c:/Users/User/Documents/AAU%2010.%20semester/Beerva/public/index.html):
```html
<!-- Prevent rubber-banding on iOS -->
<style>
  html { height: 100%; overflow: hidden; }
</style>

<!-- Splash screens for iOS (can be generated with pwa-asset-generator) -->
<link rel="apple-touch-startup-image" href="/splash-1125x2436.png" 
      media="(device-width: 375px) and (device-height: 812px)">
```

Generate proper iOS splash images for common screen sizes — without these, iOS shows a white flash on launch.

---

## Summary Priority Matrix

| Priority | Item | Effort |
|----------|------|--------|
| 🔴 High | Skeleton loaders | Low |
| 🔴 High | Splash/brand loading | Low |
| 🔴 High | Manifest enhancements | Low |
| 🔴 High | SW bundle caching | Low |
| 🔴 High | Screen transitions | Medium |
| 🔴 High | Offline feed cache | Medium |
| 🟡 Medium | Haptic feedback | Low |
| 🟡 Medium | Typography (body font) | Low |
| 🟡 Medium | Empty state illustrations | Low |
| 🟡 Medium | FAB for Record | Low |
| 🟡 Medium | Card polish | Low |
| 🟡 Medium | Image blurhash | Medium |
| 🟡 Medium | Session detail view | Medium |
| 🟡 Medium | Error boundary | Low |
| 🟡 Medium | App update flow | Low |
| 🟡 Medium | iOS PWA polish | Low |
| 🟢 Low | Pull-to-refresh visual | Low |
| 🟢 Low | Tab bar notification badge | Low |
| 🟢 Low | Dark mode refinements | Low |
| 🟢 Low | Smart pub search | Medium |

> [!IMPORTANT]
> Let me know which items you'd like me to implement! I can tackle them one-by-one or group related items together. The high-priority, low-effort items (skeleton loaders, splash screen, manifest, SW caching) would have the biggest impact for the least work.

----------- NOT IMPLEMENTED YET ----------

Still untouched from the doc: #1 offline cache, #4 blurhash, #5 session detail, #6 SW update flow, #8 smart pub search, #12 empty illustrations, #20 iOS PWA polish.