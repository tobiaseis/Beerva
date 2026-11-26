const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadTypeScriptModule } = require('./loadTypeScriptModule');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

// Migration.
const sql = read('supabase/migrations/20261127130000_add_friday_nudge.sql');
assert.ok(sql, 'friday nudge migration should exist');
assert.match(sql, /add column if not exists engagement_pushes_enabled boolean not null default true/i, 'opt-out defaults to on');
assert.match(sql, /create table if not exists public\.engagement_push_log/i);
assert.match(sql, /primary key \(user_id, kind, week_start\)/i, 'one engagement push per user, kind and week');
assert.match(sql, /alter table public\.engagement_push_log enable row level security/i);
assert.match(sql, /'friday_nudge',\s*'weekly_recap'/i, 'both engagement notification types are allowed');
assert.match(sql, /'beverage_submission',/i, 'existing notification types stay allowed');
assert.match(sql, /create or replace function public\.queue_friday_nudges\(\s*force boolean default false,\s*only_user_id uuid default null\s*\)/i);
assert.match(sql, /only_user_id is null or p\.id = only_user_id/i, 'testing can target a single user');
assert.match(sql, /extract\(isodow from local_now\) <> 5/i, 'only on Fridays');
assert.match(sql, /local_now::time < time '17:30'/i);
assert.match(sql, /local_now::time >= time '19:00'/i);
assert.match(sql, /p\.engagement_pushes_enabled/i, 'respects the opt-out');
assert.match(sql, /from public\.push_subscriptions/i, 'web push users');
assert.match(sql, /from public\.native_push_tokens/i, 'android push users');
assert.match(sql, /now\(\) - interval '8 weeks'/i, 'only recently active users');
assert.match(sql, /s\.status in \('published', 'active'\)/i, 'skip anyone who already logged or is out right now');
assert.match(sql, /on conflict \(user_id, kind, week_start\) do nothing\s+returning user_id into claimed_user/i, 'claims the log row before notifying');
assert.match(sql, /public\.get_weekly_streaks\(array\[p\.id\]\)/i, 'uses the weekly streak');
assert.match(sql, /'friday_nudge',\s*null,/i);
assert.match(sql, /revoke execute on function public\.queue_friday_nudges\(boolean, uuid\) from public, anon, authenticated/i, 'only cron can run it');
assert.match(sql, /cron\.schedule\(\s*'beerva-friday-nudge',\s*'\*\/15 15-18 \* \* 5'/i, 'Friday evenings in UTC cover both CET and CEST');

// Shared copy.
const copy = loadTypeScriptModule('supabase/functions/_shared/engagementCopy.ts');
assert.equal(copy.formatMateNames([], 0), '');
assert.equal(copy.formatMateNames(['Mads'], 1), 'Mads');
assert.equal(copy.formatMateNames(['Mads', 'Sofie'], 2), 'Mads and Sofie');
assert.equal(copy.formatMateNames(['Mads', 'Sofie'], 5), 'Mads, Sofie and 3 others');
assert.equal(copy.formatMateNames(['Mads'], 2), 'Mads and 1 other');

assert.deepEqual(copy.buildFridayNudgeCopy({ weekly_streak: 5, mate_names: ['Mads'], mates_out: 1 }), {
  title: 'Keep the streak alive 🔥',
  body: "You're on a 5-week streak. One night out this weekend keeps it going.",
}, 'a streak at risk wins over mates');
assert.deepEqual(copy.buildFridayNudgeCopy({ weekly_streak: 1, mate_names: ['Mads', 'Sofie'], mates_out: 4 }), {
  title: "Weekend's here 🍻",
  body: 'Mads, Sofie and 2 others were out last weekend. Plans tonight?',
});
assert.deepEqual(copy.buildFridayNudgeCopy({ mate_names: ['Mads'], mates_out: '1' }), {
  title: "Weekend's here 🍻",
  body: 'Mads was out last weekend. Plans tonight?',
});
assert.deepEqual(copy.buildFridayNudgeCopy(null), {
  title: "Weekend's here 🍻",
  body: 'Heading out tonight? Log your first round on Beerva.',
});
assert.deepEqual(copy.buildFridayNudgeCopy({ mate_names: [' ', 42, null] }), {
  title: "Weekend's here 🍻",
  body: 'Heading out tonight? Log your first round on Beerva.',
}, 'junk names are ignored');

// Edge function.
const sendPush = read('supabase/functions/send-push/index.ts');
assert.match(sendPush, /import \{ buildFridayNudgeCopy[^}]*\} from '\.\.\/_shared\/engagementCopy\.ts';/);
assert.match(sendPush, /\| 'friday_nudge'/);
assert.match(sendPush, /record\.type === 'friday_nudge'[\s\S]*buildFridayNudgeCopy\(record\.metadata\)/);
assert.match(sendPush, /url = `\/\?tab=record&notificationId=\$\{encodeURIComponent\(record\.id\)\}`/, 'the push opens the Record screen');

// App.
assert.match(read('src/lib/notificationMessages.ts'), /mate_names\?: string\[\] \| null;/);
const notificationsScreen = read('src/screens/NotificationsScreen.tsx');
assert.match(notificationsScreen, /\| 'friday_nudge'/);
assert.match(notificationsScreen, /buildFridayNudgeCopy\(item\.metadata\)/);
assert.match(notificationsScreen, /Log a night/);
assert.match(notificationsScreen, /navigation\.navigate\('MainTabs', \{ screen: 'Record' \}\)/);

const profileScreen = read('src/screens/ProfileScreen.tsx');
assert.match(profileScreen, /engagement_pushes_enabled: next/);
assert.match(profileScreen, /Weekend reminders & weekly recap/);

console.log('friday nudge checks passed');
