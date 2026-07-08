# Graph Report - .  (2026-07-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1965 nodes · 3952 edges · 110 communities (107 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b9dcde6c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AdminToolsScreen.tsx
- PubLegendsScreen.tsx
- RootNavigator.tsx
- RecordScreen.tsx
- pwaStartup.test.js
- FakeBeerScreen.tsx
- pushNotifications.ts
- chugDetection.ts
- ProfileScreen.tsx
- FeedScreen.tsx
- profileStats.ts
- sessionBeers.ts
- liveMateSessions.test.js
- generatePwaStartupImages.js
- notifications.test.js
- drinkingBuddies.test.js
- PostDetailScreen.tsx
- AvatarCropModal.tsx
- sessionPhotos.test.js
- staticRouteMap.ts
- PubCrawlFeedCard.tsx
- floatingBottomNav.test.js
- StreakAvatar.tsx
- androidNativeApkConfig.test.js
- LiveMateSessionsSheet.tsx
- sessionBuddies.ts
- PwaInstallPrompt.tsx
- chugAttempts.ts
- sessionBeers.test.js
- appThemeScreens.test.js
- avatarCrop.test.js
- chugManualTiming.test.js
- generateAndroidAdaptiveIcon.js
- sessionFeedDetails.ts
- chugRecordScreen.test.js
- feedCardRedesign.test.js
- nativeLocation.test.js
- nativeNotificationRouting.test.js
- nativePushDatabase.test.js
- pushDelivery.test.js
- pwaInstallPrompt.test.js
- serve-dist.js
- timeouts.test.js
- appThemeTokens.test.js
- chugBottleButton.test.js
- chugEditSession.test.js
- easArchiveIgnore.test.js
- profileAvatarCrop.test.js
- staleSessionAutoClose.test.js
- logoUsage.test.js
- nativePushClient.test.js
- chugFeedStats.test.js
- githubPages.test.js
- navigationBackHistory.test.js
- recordSessionDrinks.test.js
- chugMediaPipeBundle.test.js
- chugProofStorage.test.js
- chugVerificationScreen.test.js
- feedHeader.test.js
- get_trim_box
- profileStatsPanel.test.js
- recordPlaceCategory.test.js
- baseRow
- versionServiceWorker.js
- profileStats.test.js
- challenges.test.js
- EditSessionScreen.tsx
- pubCrawl.test.js
- colors.ts
- fakeBeerEasterEgg.test.js
- mentions.test.js
- pubCrawls.ts
- officialBeervaPosts.test.js
- typography.ts
- adminTools.test.js
- pubCrawlsApi.ts
- hangover.test.js
- sessionFeedDetails.test.js
- NotificationsScreen.tsx
- supabase.ts
- mentions.ts
- pubLegends.test.js
- feedPagination.test.js
- pushReminderPrompt.test.js
- index.ts
- streakFlame.test.js
- chugDetection.test.js
- pubRoulette.test.js
- index.ts
- PeopleScreen.tsx
- nativeNotificationRouting.ts
- chugDatabase.test.js
- index.ts
- authConfirmationRedirect.test.js
- chugAttempts.test.js
- chugNotifications.test.js
- pubDirectory.test.js
- postTargets.ts
- alcoholUnits.test.js
- authSession.test.js
- serveDist.test.js
- TrophyUnlockModal.tsx
- index.ts
- EmptyIllustration.tsx
- request
- ErrorBoundary
- notificationsContext.tsx
- index.ts

## God Nodes (most connected - your core abstractions)
1. `colors` - 51 edges
2. `RecordScreen()` - 50 edges
3. `withTimeout()` - 41 edges
4. `radius` - 41 edges
5. `supabase` - 38 edges
6. `typography` - 37 edges
7. `AdminToolsScreen()` - 33 edges
8. `getErrorMessage()` - 32 edges
9. `FeedScreen()` - 32 edges
10. `spacing` - 29 edges

## Surprising Connections (you probably didn't know these)
- `loadTypeScriptModule()` --indirect_call--> `request()`  [INFERRED]
  authSession.test.js → serveDist.test.js
- `mapChugAttemptRow()` --indirect_call--> `FeedScreen()`  [INFERRED]
  lib/chugAttempts.ts → screens/FeedScreen.tsx
- `mapChugAttemptRow()` --indirect_call--> `PostDetailScreen()`  [INFERRED]
  lib/chugAttempts.ts → screens/PostDetailScreen.tsx
- `openMaps()` --references--> `linking`  [EXTRACTED]
  lib/maps.ts → navigation/RootNavigator.tsx
- `cleanUsername()` --indirect_call--> `ProfileSetupScreen()`  [INFERRED]
  lib/mentions.ts → screens/ProfileSetupScreen.tsx

## Import Cycles
- None detected.

## Communities (110 total, 3 thin omitted)

### Community 0 - "AdminToolsScreen.tsx"
Cohesion: 0.06
Nodes (82): WinnerOfficialFeedPostCard(), AdminBeverage, AdminBeverageCategory, AdminBeverageRow, AdminChallenge, AdminChallengeRow, AdminChallengeType, AdminModerationDrink (+74 more)

### Community 1 - "PubLegendsScreen.tsx"
Cohesion: 0.06
Nodes (70): CHALLENGE_LEADERBOARD_SCOPE, CHALLENGE_STATUS, CHALLENGE_TYPE, ChallengeDetail, ChallengeDetailRow, ChallengeLeaderboard, ChallengeLeaderboardEntry, ChallengeLeaderboardRow (+62 more)

### Community 2 - "RootNavigator.tsx"
Cohesion: 0.12
Nodes (25): syncCurrentTimezone(), AndroidFloatingTabBar(), beervaLogo, ChugVerificationLaunchParams, clearChallengeLaunchParams(), clearChugVerificationLaunchParams(), clearHangoverLaunchParams(), clearNotificationLaunchParams() (+17 more)

### Community 3 - "RecordScreen.tsx"
Cohesion: 0.05
Nodes (84): bottleImage, ChugBottleButton(), clamp(), Props, styles, PubRouletteModal(), chugVideoFromPickerAsset(), cleanPathSegment() (+76 more)

### Community 4 - "pwaStartup.test.js"
Cohesion: 0.08
Nodes (27): APP_BACKGROUND_RGB, appSource, assert, assertManifestIconUsesAppBackground(), assertRgbNear(), assertStartupImageUsesFlatAppBackground(), enablePushNotificationsBody, fs (+19 more)

### Community 5 - "FakeBeerScreen.tsx"
Cohesion: 0.08
Nodes (40): FakeBeerUnlockOverlay(), FakeBeerUnlockOverlayProps, styles, BubbleStreamConfig, CarbonationBubble, clamp(), clamp01(), FakeBeerVisual() (+32 more)

### Community 6 - "pushNotifications.ts"
Cohesion: 0.10
Nodes (44): PushReminderPrompt(), attachPushSubscriptionRepairFlow(), attachServiceWorkerUpdateFlow(), disablePushNotifications(), enablePushNotifications(), ensureAndroidNotificationChannel(), getCurrentNativePushToken(), getExpoProjectId() (+36 more)

### Community 7 - "chugDetection.ts"
Cohesion: 0.11
Nodes (32): analyzeChugContactFrames(), boxesAreInContactRange(), boxesOverlap(), ChugDetectionFrame, ChugDetectionResult, ChugLandmark, ChugPoint, ChugRect (+24 more)

### Community 8 - "ProfileScreen.tsx"
Cohesion: 0.09
Nodes (40): InsightKind, ProfileStatsPanel(), ProfileStatsPanelProps, styles, StreakAvatar, openMaps(), emptyStats, getTrophies() (+32 more)

### Community 9 - "FeedScreen.tsx"
Cohesion: 0.08
Nodes (30): LiveMateButton(), AllTrophiesUnlockedModal(), fetchJoinedActiveChallengeSummary(), fetchOfficialChallenges(), appendFeedPage(), FeedOrderable, sortFeedItemsByPublishedAt(), fetchOfficialPostLinkedChallengeSummaries() (+22 more)

### Community 10 - "profileStats.ts"
Cohesion: 0.17
Nodes (25): calculateStats(), calculateTopPubVisits(), dateKeyFromParts(), getBeerKey(), getBeverageStatKey(), getCapturedBeverageCategory(), getCopenhagenParts(), getPubKey() (+17 more)

### Community 11 - "sessionBeers.ts"
Cohesion: 0.06
Nodes (56): AutocompleteInput(), normalizeSearchText(), BeerDraftForm(), BeerDraftFormProps, styles, AnalysisPreview, ChugAttemptModal(), ChugAttemptModalProps (+48 more)

### Community 12 - "liveMateSessions.test.js"
Cohesion: 0.11
Nodes (17): assert, drinkInvalidationMigrationPath, feedScreenSource, fs, liveButtonPath, liveButtonSource, liveMateApiSource, liveMateHookPath (+9 more)

### Community 13 - "generatePwaStartupImages.js"
Cohesion: 0.15
Nodes (16): BACKGROUND, clamp(), compositeLogo(), fs, generateIcon(), getSourcePixel(), indexHtml, logo (+8 more)

### Community 14 - "notifications.test.js"
Cohesion: 0.12
Nodes (15): assert, feedScreenSource, fs, {
  getNotificationPostTarget,
  getPostLaunchParamsFromSearch,
  normalizePostTargetType,
}, {
  getOfficialNotificationBody,
  getOfficialNotificationTitle,
  getNotificationMessage,
  getNotificationPubName,
}, migrationSql, Module, notificationsScreenSource (+7 more)

### Community 15 - "drinkingBuddies.test.js"
Cohesion: 0.12
Nodes (15): assert, buddyLibPath, buddyLibSource, editScreenSource, feedSource, fs, migrationPath, Module (+7 more)

### Community 16 - "PostDetailScreen.tsx"
Cohesion: 0.12
Nodes (21): ImageViewerModal(), buildSegments(), MentionText(), Props, Segment, CurrentStreakRow, fetchCurrentStreaks(), ContentMention (+13 more)

### Community 17 - "AvatarCropModal.tsx"
Cohesion: 0.20
Nodes (16): AvatarCropModal(), AvatarCropModalProps, ControlButtonProps, cropAvatarImage(), cropAvatarOnNative(), cropAvatarOnWeb(), styles, AvatarCropInput (+8 more)

### Community 18 - "sessionPhotos.test.js"
Cohesion: 0.12
Nodes (14): assert, cleanupFunctionSource, editScreenSource, feedScreenSource, fs, {
  MAX_SESSION_PHOTOS,
  TEMP_SESSION_PHOTO_LIFETIME_MS,
  buildSessionPhotoRecords,
  getAllSessionPhotoUrls,
  getVisibleSessionPhotoUrls,
}, Module, now (+6 more)

### Community 19 - "staticRouteMap.ts"
Cohesion: 0.17
Nodes (18): PubCrawlStop, clamp(), getMappedStops(), getRouteBounds(), getStaticMapViewport(), latitudeToTileY(), latLonToTile(), longitudeToTileX() (+10 more)

### Community 20 - "PubCrawlFeedCard.tsx"
Cohesion: 0.17
Nodes (16): beervaLogo, CheersLogo, CheersLogoProps, formatStatNumber(), getCheersLabel(), getCommentsLabel(), getStopDrinkCount(), getTimeAgo() (+8 more)

### Community 21 - "floatingBottomNav.test.js"
Cohesion: 0.14
Nodes (10): androidTabBarSource, assert, feedScreenSource, fs, layoutSource, path, recordTab, screenOptions (+2 more)

### Community 22 - "StreakAvatar.tsx"
Cohesion: 0.15
Nodes (15): AnimatedPath, AVATAR_FLAME_PATHS, AvatarFlamePath, buildTongue(), FLAME_BASE_ANGLES, MARGIN_KEYS, r1(), StreakAvatarProps (+7 more)

### Community 23 - "androidNativeApkConfig.test.js"
Cohesion: 0.17
Nodes (11): androidForegroundPath, appJson, assert, easJson, easPath, firebaseConfig, firebaseConfigPath, fs (+3 more)

### Community 24 - "LiveMateSessionsSheet.tsx"
Cohesion: 0.22
Nodes (16): LiveMateSessionsSheet(), LiveMateSessionsSheetProps, styles, fetchLiveMateSessions(), formatLiveMateCount(), formatLiveStartedLabel(), formatLiveTruePints(), getLiveMateDisplayName() (+8 more)

### Community 25 - "sessionBuddies.ts"
Cohesion: 0.23
Nodes (13): DrinkingBuddiesPicker(), fetchMutualMateOptions(), fetchSessionBuddies(), fetchSessionBuddySummaries(), FollowInRow, FollowOutRow, formatDrinkingBuddyNames(), mapSessionBuddyRow() (+5 more)

### Community 26 - "PwaInstallPrompt.tsx"
Cohesion: 0.26
Nodes (13): BeforeInstallPromptEvent, InstallPromptMode, PwaInstallPrompt(), styles, BrowserInstallEnvironment, getBrowserInstallEnvironment(), getInstallPromptStorage(), InstallPromptStorage (+5 more)

### Community 27 - "chugAttempts.ts"
Cohesion: 0.19
Nodes (14): ChugTimingSource, ChugVerificationStatus, formatChugStatusLabel(), getChugStatSubtitle(), getFastestVisibleChugAttempt(), getVisibleChugStat(), isBottleChugEligibleBeer(), mapChugAttemptRow() (+6 more)

### Community 28 - "sessionBeers.test.js"
Cohesion: 0.18
Nodes (8): assert, {
  beerDraftToPayload,
  getBeverageDefaultVolume,
  isBeverageAutoAdded,
  isBeverageVolumeLocked,
  getSessionBeerBreakdownLines,
  getSessionBeerSummary,
  getBeverageCatalogItem,
  mergeBeverageCatalog,
}, duplicateTuborgRows, failures, fs, Module, path, ts

### Community 29 - "appThemeScreens.test.js"
Cohesion: 0.20
Nodes (8): assert, fs, legacySurfacePatterns, path, recordScreen, rouletteModal, scannedFiles, trophyModal

### Community 30 - "avatarCrop.test.js"
Cohesion: 0.20
Nodes (8): assert, centeredLandscape, fs, {
  getAvatarCropLayout,
  getAvatarCropRect,
  clampAvatarZoom,
  MIN_AVATAR_CROP_ZOOM,
  MAX_AVATAR_CROP_ZOOM,
}, layout, Module, path, ts

### Community 31 - "chugManualTiming.test.js"
Cohesion: 0.20
Nodes (9): assert, compiledModule, filename, fs, Module, { outputText }, path, source (+1 more)

### Community 32 - "generateAndroidAdaptiveIcon.js"
Cohesion: 0.20
Nodes (9): fs, offset, output, outputPath, path, { PNG }, root, source (+1 more)

### Community 33 - "sessionFeedDetails.ts"
Cohesion: 0.23
Nodes (11): asArray(), FeedDetailAuthor, FeedDetailCheer, FeedDetailComment, fetchSessionFeedDetails(), mapSessionBeer(), mapSessionFeedDetailRow(), numberOrNull() (+3 more)

### Community 34 - "chugRecordScreen.test.js"
Cohesion: 0.22
Nodes (8): addBoozeIndex, assert, chugPanelIndex, fs, modalSource, path, postDetailsIndex, recordSource

### Community 35 - "feedCardRedesign.test.js"
Cohesion: 0.25
Nodes (7): assert, assertModernFeedCard(), extractStyleBlock(), feedScreen, fs, path, pubCrawlCard

### Community 36 - "nativeLocation.test.js"
Cohesion: 0.22
Nodes (8): assert, fs, helperPath, helperSource, packageJson, path, recordSource, root

### Community 37 - "nativeNotificationRouting.test.js"
Cohesion: 0.22
Nodes (8): assert, fs, helperPath, helperSource, navigatorSource, packageJson, path, root

### Community 38 - "nativePushDatabase.test.js"
Cohesion: 0.22
Nodes (8): assert, diagnosticsBlock, fs, migrationPath, migrationSql, packageJson, path, root

### Community 39 - "pushDelivery.test.js"
Cohesion: 0.22
Nodes (8): assert, configPath, fs, migrationSql, path, pushDeliveryAttemptsMigrationPath, root, sendPushSource

### Community 40 - "pwaInstallPrompt.test.js"
Cohesion: 0.22
Nodes (8): appSource, assert, fs, installPromptComponentSource, installPromptLibSource, packageJson, path, root

### Community 41 - "serve-dist.js"
Cohesion: 0.22
Nodes (7): contentTypes, distDir, fs, http, path, port, server

### Community 42 - "timeouts.test.js"
Cohesion: 0.25
Nodes (8): assert, fs, loadTypeScriptModule(), Module, path, root, run(), ts

### Community 43 - "appThemeTokens.test.js"
Cohesion: 0.25
Nodes (6): assert, colorsSource, feedCardSource, fs, path, surfaceSource

### Community 44 - "chugBottleButton.test.js"
Cohesion: 0.25
Nodes (6): assert, assetPath, componentSource, fs, path, { PNG }

### Community 45 - "chugEditSession.test.js"
Cohesion: 0.25
Nodes (7): addBoozeIndex, assert, chugPanelIndex, detailsIndex, editSource, fs, path

### Community 46 - "easArchiveIgnore.test.js"
Cohesion: 0.25
Nodes (7): assert, fs, ignoreLines, ignorePath, packageJson, path, root

### Community 47 - "profileAvatarCrop.test.js"
Cohesion: 0.25
Nodes (6): assert, cropModalSource, fs, path, profileScreenSource, setupScreenSource

### Community 48 - "staleSessionAutoClose.test.js"
Cohesion: 0.25
Nodes (7): assert, fs, migrationPath, packageJson, path, root, sql

### Community 49 - "logoUsage.test.js"
Cohesion: 0.29
Nodes (5): assert, authConfirmed, fs, path, uiSources

### Community 50 - "nativePushClient.test.js"
Cohesion: 0.29
Nodes (6): assert, fs, packageJson, path, root, source

### Community 51 - "chugFeedStats.test.js"
Cohesion: 0.33
Nodes (5): assert, feedSource, fs, path, postDetailSource

### Community 52 - "githubPages.test.js"
Cohesion: 0.33
Nodes (5): assert, fs, noJekyllPath, path, root

### Community 53 - "navigationBackHistory.test.js"
Cohesion: 0.33
Nodes (5): assert, expectedRoutePaths, fs, path, source

### Community 54 - "recordSessionDrinks.test.js"
Cohesion: 0.33
Nodes (5): assert, beerDraftFormSource, fs, path, source

### Community 55 - "chugMediaPipeBundle.test.js"
Cohesion: 0.40
Nodes (4): assert, fs, path, source

### Community 56 - "chugProofStorage.test.js"
Cohesion: 0.40
Nodes (4): assert, fs, path, source

### Community 57 - "chugVerificationScreen.test.js"
Cohesion: 0.40
Nodes (4): assert, fs, path, source

### Community 58 - "feedHeader.test.js"
Cohesion: 0.40
Nodes (4): assert, feedScreenSource, fs, path

### Community 59 - "get_trim_box"
Cohesion: 0.50
Nodes (4): Image, get_trim_box(), normalize_bottle(), Path

### Community 60 - "profileStatsPanel.test.js"
Cohesion: 0.40
Nodes (4): assert, fs, path, source

### Community 61 - "recordPlaceCategory.test.js"
Cohesion: 0.40
Nodes (4): assert, fs, path, source

### Community 62 - "baseRow"
Cohesion: 0.50
Nodes (4): baseRow(), dayRow(), monthRow(), twoPintWeekRow()

### Community 63 - "versionServiceWorker.js"
Cohesion: 0.50
Nodes (3): fs, path, swPath

### Community 64 - "profileStats.test.js"
Cohesion: 0.03
Nodes (55): accentVariantRtdStats, allTrophiesStats, assert, awardTrophy, {
  BEER_CATALOG,
  beerDraftToPayload,
  getBeverageCatalogItem,
  getBeverageDefaultVolume,
  getBeverageOptionSearchText,
  getBeerLine,
  getSessionBeerSummary,
  isBeverageAutoAdded,
  VOLUMES,
}, beverageCategoryMigration, brokenWeekPintStreakStats, { calculateStats, calculateTopPubVisits, didUnlockAllTrophies, emptyStats, getTrophies, getVolumeMl } (+47 more)

### Community 65 - "challenges.test.js"
Cohesion: 0.04
Nodes (41): adminChallengesMigrationSql, apiSource, archiveMigrationSql, assert, boozeInJuneLeaderboardUnitsMigrationSql, boozeInJuneUnitsFixMigrationSql, {
  CHALLENGE_STATUS,
  CHALLENGE_TYPE,
  formatChallengeProgress,
  formatChallengeRank,
  formatChallengeStatusLabel,
  getChallengePreJoinCopy,
  getChallengeStatus,
  getLeaderboardEntryMeta,
  isLeaderboardChallenge,
  mapChallengeDetailRow,
  mapChallengeSummaryRow,
}, challengeDetailSql (+33 more)

### Community 66 - "EditSessionScreen.tsx"
Cohesion: 0.10
Nodes (32): Props, styles, DrinkingBuddiesPickerProps, styles, IgnoredDrinkBadge(), IgnoredDrinkBadgeProps, showSuspiciousDrinkInfo(), styles (+24 more)

### Community 67 - "pubCrawl.test.js"
Cohesion: 0.07
Nodes (31): aalborgTile, assert, bounds, {
  buildPubCrawlMediaSlides,
  calculatePubCrawlSummary,
  mapPubCrawlRow,
}, crawl, crawlRow, createHydrationFailingSupabaseMock(), createHydrationSuccessfulSupabaseMock() (+23 more)

### Community 68 - "colors.ts"
Cohesion: 0.11
Nodes (20): CachedImage, CachedImageProps, styles, Props, styles, LiveMateButtonProps, styles, Props (+12 more)

### Community 69 - "fakeBeerEasterEgg.test.js"
Cohesion: 0.07
Nodes (25): androidDrinkingMotion, androidNeutralMotion, androidSideTiltMotion, appJson, assert, {
  createFakeBeerMotionBaseline,
  getFakeBeerMotionSignal,
}, fakeBeerMotionPath, fakeBeerOverlaySource (+17 more)

### Community 70 - "mentions.test.js"
Cohesion: 0.07
Nodes (27): assert, calls, fakeSupabase, feedScreenSource, fs, mentionComposerPath, mentionMigrationPath, mentionNotifications (+19 more)

### Community 71 - "pubCrawls.ts"
Cohesion: 0.14
Nodes (25): AlcoholUnitDrink, calculateAlcoholUnits(), getAbv(), getQuantity(), getServingVolumeMl(), roundStat(), toFiniteNumber(), ActivePubCrawlFallbackState (+17 more)

### Community 72 - "officialBeervaPosts.test.js"
Cohesion: 0.08
Nodes (22): adminApiSource, adminScreenSource, adminTools, announcement, announcementCardSection, assert, challengeLaunchParams, emptyOfficialDraft (+14 more)

### Community 73 - "typography.ts"
Cohesion: 0.11
Nodes (20): ErrorBoundaryProps, ErrorBoundaryState, styles, CASINO_ACCENTS, createSegmentPath(), getPubIdentity(), includesPub(), polarPoint() (+12 more)

### Community 74 - "adminTools.test.js"
Cohesion: 0.08
Nodes (21): adminApiSource, adminScreenSource, adminTools, adminToolsSource, archiveMigrationSql, assert, baseChallengeDraft, beverageCategoryMigrationSql (+13 more)

### Community 75 - "pubCrawlsApi.ts"
Cohesion: 0.12
Nodes (24): getCurrentUser(), PubCrawlStopRow, ActivePubCrawlState, addPubCrawlComment(), BeerRow, cancelPubCrawl(), CheerRow, CommentRow (+16 more)

### Community 76 - "hangover.test.js"
Cohesion: 0.09
Nodes (20): allMigrationSql, assert, crawlCardSource, feedScreenSource, fs, karnevalsdrukFinalizationRecoverySql, karnevalsdrukHangoverMigrationSql, karnevalsdrukJoinResilienceMigrationSql (+12 more)

### Community 77 - "sessionFeedDetails.test.js"
Cohesion: 0.09
Nodes (22): assert, beverageCategoryMigrationPath, beverageCategorySql, drinkInvalidationMigrationPath, drinkInvalidationSql, emptyMapped, feedDetails, feedLibSource (+14 more)

### Community 78 - "NotificationsScreen.tsx"
Cohesion: 0.14
Nodes (21): getNotificationMessage(), getNotificationPubName(), getOfficialNotificationBody(), getOfficialNotificationTitle(), NotificationMessageInput, NotificationMetadata, toCleanString(), declineSessionBuddy() (+13 more)

### Community 79 - "supabase.ts"
Cohesion: 0.15
Nodes (12): AppButton(), AppButtonProps, styles, SelectedImage, supabase, useFocused(), AuthNotice, AuthScreen() (+4 more)

### Community 80 - "mentions.ts"
Cohesion: 0.16
Nodes (19): MentionComposer(), MentionSurface, MentionTargetType, notifyContentMentions(), NotifyContentMentionsInput, notifyContentMentionsSafely(), cleanUsername(), fetchContentMentionsForSources() (+11 more)

### Community 81 - "pubLegends.test.js"
Cohesion: 0.11
Nodes (17): apiSource, assert, {
  formatHoursSinceLastDrink,
  formatTruePints,
  mapFriendPubWatchRow,
  mapFriendPubWatchRows,
  mapPubKingSessionRow,
  mapPubLegendRow,
}, friendLeaderboardsMigrationSql, fs, legacyPubMergeMigrationSql, legacySessionRepairMigrationSql, legendDetailSource (+9 more)

### Community 82 - "feedPagination.test.js"
Cohesion: 0.12
Nodes (15): appended, assert, feedSource, fs, Module, naiveResort, officialSource, page2 (+7 more)

### Community 83 - "pushReminderPrompt.test.js"
Cohesion: 0.12
Nodes (13): assert, componentPath, componentSource, fs, helperPath, Module, packageJson, path (+5 more)

### Community 84 - "index.ts"
Cohesion: 0.16
Nodes (8): cityFromAddress(), clean(), conciseAddressFromLookup(), corsHeaders, firstAddressValue(), NominatimLookupRow, PubRow, PubUpdate

### Community 85 - "streakFlame.test.js"
Cohesion: 0.13
Nodes (12): assert, feedScreen, fs, migration, Module, path, postDetail, profileScreen (+4 more)

### Community 86 - "chugDetection.test.js"
Cohesion: 0.14
Nodes (12): {
  analyzeChugContactFrames,
  boxesOverlap,
  getMouthBoxFromLandmarks,
}, assert, failed, frames, jitteryNearContactFrames, jitteryNearContactResult, Module, occludedMouthFrames (+4 more)

### Community 87 - "pubRoulette.test.js"
Cohesion: 0.14
Nodes (11): assert, candidates, fs, {
  getRouletteTargetRotation,
  getRouletteNoPubsMessage,
  isRoulettePubInRange,
  pickRouletteWinner,
  prepareRoulettePubs,
  ROULETTE_MAX_DISTANCE_METERS,
  ROULETTE_MAX_WHEEL_PUBS,
}, manyPubs, Module, path, prepared (+3 more)

### Community 88 - "index.ts"
Cohesion: 0.14
Nodes (6): NativePushDeliveryStatus, NativePushTokenRow, NotificationRow, PUSH_SEND_OPTIONS, PushDeliveryStatus, PushSubscriptionRow

### Community 89 - "PeopleScreen.tsx"
Cohesion: 0.18
Nodes (10): SkeletonFeedCard(), SkeletonPersonRow(), SkeletonProfile(), SkeletonProps, styles, FollowRow, PeopleScreen(), styles (+2 more)

### Community 90 - "nativeNotificationRouting.ts"
Cohesion: 0.26
Nodes (11): ChallengeLaunchParams, getChallengeLaunchParamsFromSearch(), toCleanString(), cleanString(), consumeInitialNativeNotificationTarget(), getNativeNotificationTargetFromUrl(), getSearchFromUrl(), getTargetFromNotificationResponse() (+3 more)

### Community 91 - "chugDatabase.test.js"
Cohesion: 0.17
Nodes (11): assert, expiryMigrationPath, expirySource, fs, migrationPath, path, retimingMigrationPath, retimingSource (+3 more)

### Community 92 - "index.ts"
Cohesion: 0.26
Nodes (10): buildOverpassQuery(), corsHeaders, fetchOsmPubsNear(), fetchWithTimeout(), firstTag(), OsmPubCandidate, OverpassElement, toAddress() (+2 more)

### Community 93 - "authConfirmationRedirect.test.js"
Cohesion: 0.18
Nodes (10): assert, elements, fs, path, replacedUrls, sandbox, scriptMatch, source (+2 more)

### Community 94 - "chugAttempts.test.js"
Cohesion: 0.18
Nodes (9): assert, attempts, catalog, {
  CHUG_REQUIRED_VOLUME,
  formatChugDuration,
  formatChugStatusLabel,
  getChugBeerOptions,
  getFastestVisibleChugAttempt,
  getChugStatSubtitle,
  getVisibleChugStat,
  isBottleChugEligibleBeer,
  mapChugAttemptRow,
}, expiredAttempt, Module, path, pendingAttempt (+1 more)

### Community 95 - "chugNotifications.test.js"
Cohesion: 0.18
Nodes (9): assert, fs, { getNotificationMessage }, Module, notificationsScreenSource, path, pushSource, rootNavigatorSource (+1 more)

### Community 96 - "pubDirectory.test.js"
Cohesion: 0.27
Nodes (9): assert, createSupabaseMock(), fs, loadPubDirectory(), loadTypeScriptModuleWithMocks(), Module, path, run() (+1 more)

### Community 97 - "postTargets.ts"
Cohesion: 0.29
Nodes (9): getNotificationPostTarget(), getPostLaunchParamsFromSearch(), normalizePostTargetType(), NotificationTargetInput, PostLaunchParams, PostTarget, PostTargetType, toCleanString() (+1 more)

### Community 98 - "alcoholUnits.test.js"
Cohesion: 0.22
Nodes (7): assert, {
  calculateAlcoholUnits,
  getServingVolumeMl,
}, fs, Module, path, root, ts

### Community 99 - "authSession.test.js"
Cohesion: 0.22
Nodes (7): assert, fs, loadTypeScriptModule(), Module, path, root, ts

### Community 100 - "serveDist.test.js"
Cohesion: 0.22
Nodes (6): assert, http, net, path, root, { spawn }

### Community 101 - "TrophyUnlockModal.tsx"
Cohesion: 0.25
Nodes (8): renderTrophyIcon(), AllTrophiesUnlockedModalProps, prizeColors, prizeDots, Props, styles, TrophyUnlockModal(), TrophyDefinition

### Community 102 - "index.ts"
Cohesion: 0.28
Nodes (5): corsHeaders, firstTag(), OverpassElement, toAddress(), toCity()

### Community 104 - "request"
Cohesion: 0.33
Nodes (6): loadTypeScriptModule(), loadTypeScriptModule(), loadTypeScriptModule(), loadTypeScriptModule(), request(), loadTypeScriptModule()

### Community 106 - "notificationsContext.tsx"
Cohesion: 0.33
Nodes (5): NotificationsContext, NotificationsContextValue, NotificationsProvider(), useNotifications(), MainTabs()

## Knowledge Gaps
- **1011 isolated node(s):** `AppButtonProps`, `styles`, `Props`, `styles`, `AvatarCropModalProps` (+1006 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `supabase.ts` to `AdminToolsScreen.tsx`, `PubLegendsScreen.tsx`, `RootNavigator.tsx`, `RecordScreen.tsx`, `pushNotifications.ts`, `ProfileScreen.tsx`, `FeedScreen.tsx`, `sessionBeers.ts`, `PostDetailScreen.tsx`, `LiveMateSessionsSheet.tsx`, `sessionBuddies.ts`, `sessionFeedDetails.ts`, `EditSessionScreen.tsx`, `colors.ts`, `pubCrawlsApi.ts`, `NotificationsScreen.tsx`, `mentions.ts`, `PeopleScreen.tsx`, `notificationsContext.tsx`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `colors` connect `colors.ts` to `AdminToolsScreen.tsx`, `PubLegendsScreen.tsx`, `RootNavigator.tsx`, `RecordScreen.tsx`, `FakeBeerScreen.tsx`, `ProfileScreen.tsx`, `FeedScreen.tsx`, `sessionBeers.ts`, `PostDetailScreen.tsx`, `AvatarCropModal.tsx`, `PubCrawlFeedCard.tsx`, `StreakAvatar.tsx`, `LiveMateSessionsSheet.tsx`, `PwaInstallPrompt.tsx`, `EditSessionScreen.tsx`, `typography.ts`, `NotificationsScreen.tsx`, `supabase.ts`, `PeopleScreen.tsx`, `TrophyUnlockModal.tsx`, `EmptyIllustration.tsx`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `radius` connect `EditSessionScreen.tsx` to `AdminToolsScreen.tsx`, `PubLegendsScreen.tsx`, `RootNavigator.tsx`, `RecordScreen.tsx`, `colors.ts`, `TrophyUnlockModal.tsx`, `FakeBeerScreen.tsx`, `ProfileScreen.tsx`, `typography.ts`, `FeedScreen.tsx`, `sessionBeers.ts`, `NotificationsScreen.tsx`, `supabase.ts`, `PostDetailScreen.tsx`, `PubCrawlFeedCard.tsx`, `LiveMateSessionsSheet.tsx`, `PeopleScreen.tsx`, `PwaInstallPrompt.tsx`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `RecordScreen()` (e.g. with `formatPubLabel()` and `createEmptyBeerDraft()`) actually correct?**
  _`RecordScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AppButtonProps`, `styles`, `Props` to the rest of the system?**
  _1011 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AdminToolsScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.055822466254861584 - nodes in this community are weakly interconnected._
- **Should `PubLegendsScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06140350877192982 - nodes in this community are weakly interconnected._