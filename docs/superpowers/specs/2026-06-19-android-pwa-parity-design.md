# Android PWA Parity Design

## Goal

Make the Android native navigation and icon visually match the existing PWA without changing the PWA experience. The native feed header must also sit closer to the Android status bar without colliding with it.

## Scope

The PWA tab bar, icon, layout, and spacing remain unchanged. The work is limited to Android tab-bar rendering, Android safe-area positioning, the native feed-header inset, and the Android adaptive-icon foreground.

## Navigation

Replace Android's platform-default React Navigation tab renderer with a native-only Beerva floating pill. It will use the PWA's existing visual measurements: a 60dp dark pill, 6dp top padding, 7dp bottom padding, the same border and colors, 11dp semibold labels, and five equal-width tab columns.

Each tab column will have a fixed icon slot and centered label so longer labels cannot shift icon alignment. The pill will be horizontally centered independently of screen width and placed above Android system navigation using the reported bottom inset plus a small gap, with a conservative fallback for Samsung three-button navigation. Content insets will reserve the same visual space beneath scrollable screens.

## Header

The feed header will derive native top padding from the actual safe-area inset plus a compact 12dp gap instead of the current fixed 52dp value. Web keeps its current 12dp header padding.

## Adaptive Icon

Android will use a dedicated transparent adaptive-icon foreground containing the unchanged Beerva mark inside Android's safe zone. The mark will be materially smaller than the current full PWA icon foreground, while the adaptive background remains `#0D121A`. The PWA icon path remains `assets/beerva-app-icon.png`.

## Verification

Automated checks will cover Android-only tab-bar rendering, the adaptive-icon configuration, and the absence of PWA navigation changes. TypeScript and web export checks will protect the active PWA. Native visual verification will be performed in the next APK build, which is necessary for Android launcher icon changes to appear.
