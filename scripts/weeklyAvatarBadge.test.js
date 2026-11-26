const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadTypeScriptModule } = require('./loadTypeScriptModule');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

// Tiers.
assert.ok(read('src/lib/weeklyStreakBadge.ts'), 'weekly streak badge module should exist');
const badge = loadTypeScriptModule('src/lib/weeklyStreakBadge.ts');
assert.equal(badge.WEEKLY_AVATAR_BADGE_MIN_WEEKS, 4);
assert.equal(badge.getWeeklyAvatarBadgeTier(0), null);
assert.equal(badge.getWeeklyAvatarBadgeTier(3), null, 'short streaks stay quiet');
assert.equal(badge.getWeeklyAvatarBadgeTier(4), 'bronze');
assert.equal(badge.getWeeklyAvatarBadgeTier(11), 'bronze');
assert.equal(badge.getWeeklyAvatarBadgeTier(12), 'silver');
assert.equal(badge.getWeeklyAvatarBadgeTier(25), 'silver');
assert.equal(badge.getWeeklyAvatarBadgeTier(26), 'gold');
assert.equal(badge.getWeeklyAvatarBadgeTier(80), 'gold');
assert.equal(badge.getWeeklyAvatarBadgeTier(Number.NaN), null);
['bronze', 'silver', 'gold'].forEach((tier) => {
  assert.match(badge.WEEKLY_AVATAR_BADGE_COLORS[tier].fill, /^#[0-9A-F]{6}$/i);
  assert.match(badge.WEEKLY_AVATAR_BADGE_COLORS[tier].text, /^#[0-9A-F]{6}$/i);
});
assert.equal(badge.formatWeeklyAvatarBadge(5), '5w');

// Avatar: the flame is "nights in a row", the badge is the weekly streak.
const avatar = read('src/components/StreakAvatar.tsx');
assert.match(avatar, /weeklyStreak\?: number;/, 'avatar accepts a weekly streak');
assert.match(avatar, /getWeeklyAvatarBadgeTier\(weeklyStreak\)/);
assert.match(avatar, /formatWeeklyAvatarBadge\(weeklyStreak\)/);
assert.match(avatar, /nights in a row/, 'the flame is described as nights in a row');
assert.match(avatar, /-week streak/, 'the badge is described as a weekly streak');
assert.doesNotMatch(avatar, /day streak/, 'the flame is no longer called a streak');
assert.match(avatar, /`\$\{streak\} night\$\{streak === 1 \? '' : 's'\}`/, 'the profile flame chip counts nights');
assert.match(avatar, /if \(!tier && !weeklyBadge\) \{\s*return avatar;/, 'the badge shows even without a flame');

// Data.
assert.match(read('src/lib/feedTypes.ts'), /author_weekly_streak\?: number \| null;/);
assert.match(read('src/lib/pubCrawls.ts'), /authorWeeklyStreak\?: number \| null;/);
const feedApi = read('src/lib/feedApi.ts');
assert.match(feedApi, /fetchWeeklyStreaks\(authorIds\)/, 'one weekly streak request per feed page');
assert.match(feedApi, /author_weekly_streak: weeklyStreaksByUser\.get\(session\.user_id\)\?\.weeklyStreak \?\? 0,/);
assert.match(feedApi, /authorWeeklyStreak: weeklyStreaksByUser\.get\(feedItem\.crawl\.userId\)\?\.weeklyStreak \?\? 0,/);

// Every avatar with a flame also gets the weekly badge.
assert.match(read('src/screens/FeedScreen.tsx'), /weeklyStreak=\{item\.author_weekly_streak \|\| 0\}/);
assert.match(read('src/components/PubCrawlFeedCard.tsx'), /weeklyStreak=\{crawl\.authorWeeklyStreak \|\| 0\}/);
assert.match(read('src/screens/ProfileScreen.tsx'), /weeklyStreak=\{weeklyStreak\.weeklyStreak\}/);
assert.match(read('src/screens/UserProfileScreen.tsx'), /weeklyStreak=\{weeklyStreak\.weeklyStreak\}/);
const postDetail = read('src/screens/PostDetailScreen.tsx');
assert.match(postDetail, /const authorWeeklyStreak = useWeeklyStreak\(loadedAuthorId\);/);
assert.match(postDetail, /author_weekly_streak: authorWeeklyStreak\.weeklyStreak,/);
assert.match(postDetail, /authorWeeklyStreak: authorWeeklyStreak\.weeklyStreak,/);

// Profile stats wording.
const panel = read('src/components/ProfileStatsPanel.tsx');
assert.match(panel, />\s*Nights in a Row\s*<\/Text>/, 'the stats tile is called Nights in a Row');
assert.doesNotMatch(panel, /Longest Streak/, '"streak" now only means the weekly streak');

console.log('weekly avatar badge checks passed');
