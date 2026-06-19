import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Beer, ChevronRight, Clock, Crown, Flame, MapPin, Trophy, Users } from 'lucide-react-native';

import { CachedImage } from '../components/CachedImage';
import { EmptyIllustration } from '../components/EmptyIllustration';
import {
  ChallengeSummary,
  formatChallengeProgress,
  formatChallengeRank,
  formatChallengeStatusLabel,
  isLeaderboardChallenge,
} from '../lib/challenges';
import { fetchOfficialChallenges, joinChallenge } from '../lib/challengesApi';
import {
  formatHoursSinceLastDrink,
  formatTruePints,
  FriendPubWatchEntry,
  FriendPubWatchLeaderboards,
  PubLegend,
} from '../lib/pubLegends';
import { fetchFriendPubWatchLeaderboards, fetchPubLegends } from '../lib/pubLegendsApi';
import { hapticLight } from '../lib/haptics';
import { colors } from '../theme/colors';
import { floatingTabBarMetrics, radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const getPubLocation = (item: PubLegend) => item.city || item.address || 'Pub';

const formatChampion = (item: PubLegend) => {
  if (!item.championUserId) return 'No champion yet';
  return `${item.championUsername || 'Beer Lover'} - ${formatTruePints(item.topTruePints)}`;
};

type FriendLeaderboardMode = 'pubs' | 'active-streaks' | 'most-overdue';

const emptyFriendLeaderboards: FriendPubWatchLeaderboards = {
  activeStreaks: [],
  mostOverdue: [],
};

const getDisplayName = (entry?: FriendPubWatchEntry | null) => entry?.username || 'Beer Lover';

const formatStreakDays = (value: number) => `${value} ${value === 1 ? 'day' : 'days'}`;

const formatLastDrinkDate = (value?: string | null) => {
  if (!value) return 'Last beer unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Last beer unknown';
  return `Last beer: ${date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const getMsUntilNextHour = () => {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  return Math.max(1000, nextHour.getTime() - now.getTime());
};

export const PubLegendsScreen = ({ navigation }: any) => {
  const [activeSegment, setActiveSegment] = useState<'pub-legends' | 'challenges'>('pub-legends');
  const [legends, setLegends] = useState<PubLegend[]>([]);
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [friendLeaderboards, setFriendLeaderboards] = useState<FriendPubWatchLeaderboards>(emptyFriendLeaderboards);
  const [friendLeaderboardMode, setFriendLeaderboardMode] = useState<FriendLeaderboardMode>('pubs');
  const [screenFocused, setScreenFocused] = useState(false);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendErrorMessage, setFriendErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [legendsErrorMessage, setLegendsErrorMessage] = useState<string | null>(null);
  const [challengesErrorMessage, setChallengesErrorMessage] = useState<string | null>(null);
  const [joiningChallengeIds, setJoiningChallengeIds] = useState<Set<string>>(() => new Set());
  const requestIdRef = useRef(0);
  const hasLoadedOnce = useRef(false);

  const hottestStreak = useMemo(
    () => friendLeaderboards.activeStreaks.find((entry) => entry.currentStreak > 0) || null,
    [friendLeaderboards.activeStreaks]
  );

  const mostOverdue = friendLeaderboards.mostOverdue[0] || null;

  const activeFriendRows = friendLeaderboardMode === 'active-streaks'
    ? friendLeaderboards.activeStreaks
    : friendLeaderboardMode === 'most-overdue'
      ? friendLeaderboards.mostOverdue
      : [];

  const loadLegends = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      if (!hasLoadedOnce.current) {
        setLoading(true);
      }
      setLegendsErrorMessage(null);
      const rows = await fetchPubLegends();
      if (requestId !== requestIdRef.current) return;
      setLegends(rows);
    } catch (error) {
      console.error('Pub Legends fetch error:', error);
      if (requestId === requestIdRef.current) {
        setLegendsErrorMessage(error instanceof Error ? error.message : 'Could not load Pub Legends.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        hasLoadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadChallenges = useCallback(async () => {
    try {
      setChallengesLoading(true);
      setChallengesErrorMessage(null);
      const rows = await fetchOfficialChallenges();
      setChallenges(rows);
    } catch (error) {
      console.error('Challenges fetch error:', error);
      setChallengesErrorMessage(error instanceof Error ? error.message : 'Could not load challenges.');
    } finally {
      setChallengesLoading(false);
    }
  }, []);

  const loadFriendLeaderboards = useCallback(async () => {
    try {
      setFriendLoading(true);
      setFriendErrorMessage(null);
      const rows = await fetchFriendPubWatchLeaderboards();
      setFriendLeaderboards(rows);
    } catch (error) {
      console.error('Friend leaderboards fetch error:', error);
      setFriendErrorMessage(error instanceof Error ? error.message : 'Could not load friend leaderboards.');
    } finally {
      setFriendLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      loadLegends();
      loadChallenges();
      loadFriendLeaderboards();
      return () => setScreenFocused(false);
    }, [loadChallenges, loadFriendLeaderboards, loadLegends])
  );

  useEffect(() => {
    if (!screenFocused || activeSegment !== 'pub-legends') return undefined;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      loadFriendLeaderboards();
      intervalId = setInterval(loadFriendLeaderboards, 60 * 60 * 1000);
    }, getMsUntilNextHour());

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeSegment, loadFriendLeaderboards, screenFocused]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLegends();
    loadFriendLeaderboards();
  }, [loadFriendLeaderboards, loadLegends]);

  const handleJoinChallenge = useCallback(async (challenge: ChallengeSummary) => {
    if (challenge.joined || !challenge.joinOpen || joiningChallengeIds.has(challenge.id)) return;

    setJoiningChallengeIds((previous) => new Set(previous).add(challenge.id));
    try {
      await joinChallenge(challenge.id);
      await loadChallenges();
    } catch (error) {
      console.error('Join challenge error:', error);
      setChallengesErrorMessage(error instanceof Error ? error.message : 'Could not join challenge.');
    } finally {
      setJoiningChallengeIds((previous) => {
        const next = new Set(previous);
        next.delete(challenge.id);
        return next;
      });
    }
  }, [joiningChallengeIds, loadChallenges]);

  const openLegend = useCallback((item: PubLegend) => {
    hapticLight();
    navigation.getParent()?.navigate('PubLegendDetail', {
      pubKey: item.pubKey,
      pubId: item.pubId,
      pubName: item.pubName,
    });
  }, [navigation]);

  const openChallenge = useCallback((challenge: ChallengeSummary) => {
    hapticLight();
    navigation.getParent()?.navigate('ChallengeDetail', { challengeSlug: challenge.slug });
  }, [navigation]);

  const openFriendLeaderboard = useCallback((mode: Exclude<FriendLeaderboardMode, 'pubs'>) => {
    hapticLight();
    setFriendLeaderboardMode(mode);
  }, []);

  const closeFriendLeaderboard = useCallback(() => {
    hapticLight();
    setFriendLeaderboardMode('pubs');
  }, []);

  const renderFriendSpotlightTile = useCallback((
    mode: Exclude<FriendLeaderboardMode, 'pubs'>,
    label: string,
    entry: FriendPubWatchEntry | null,
    emptyLabel: string
  ) => {
    const isStreak = mode === 'active-streaks';
    const Icon = isStreak ? Flame : Clock;
    const metric = entry
      ? isStreak
        ? formatStreakDays(entry.currentStreak)
        : formatHoursSinceLastDrink(entry.hoursSinceLastDrink)
      : emptyLabel;

    return (
      <Pressable
        onPress={() => openFriendLeaderboard(mode)}
        style={({ pressed }) => [
          styles.friendSpotlightTile,
          isStreak ? styles.friendSpotlightTileStreak : styles.friendSpotlightTileOverdue,
          pressed ? styles.pressed : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${entry ? `${getDisplayName(entry)}, ${metric}` : emptyLabel}`}
      >
        <View style={styles.friendTileLabelRow}>
          <Icon color={isStreak ? colors.primary : colors.danger} size={13} />
          <Text style={[styles.friendTileLabel, isStreak ? styles.friendTileLabelStreak : styles.friendTileLabelOverdue]}>
            {label}
          </Text>
        </View>
        <View style={styles.friendTileMain}>
          {entry ? (
            <CachedImage
              uri={entry.avatarUrl}
              fallbackUri={`https://i.pravatar.cc/150?u=${entry.userId}`}
              style={styles.friendTileAvatar}
              recyclingKey={`friend-watch-${mode}-${entry.userId}-${entry.avatarUrl || 'fallback'}`}
              accessibilityLabel={`${getDisplayName(entry)}'s avatar`}
            />
          ) : (
            <View style={styles.friendTileAvatarEmpty}>
              <Icon color={isStreak ? colors.primary : colors.danger} size={16} />
            </View>
          )}
          <View style={styles.friendTileCopy}>
            <Text style={styles.friendTileName} numberOfLines={1}>
              {entry ? getDisplayName(entry) : emptyLabel}
            </Text>
            {entry ? (
              <Text
                style={[styles.friendTileMetric, isStreak ? styles.friendTileMetricStreak : styles.friendTileMetricOverdue]}
                numberOfLines={1}
              >
                {metric}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }, [openFriendLeaderboard]);

  const renderLegend = useCallback(({ item, index }: { item: PubLegend; index: number }) => {
    const isFirst = index === 0;
    return (
      <Pressable
        onPress={() => openLegend(item)}
        style={({ pressed }) => [
          styles.legendRow,
          isFirst ? styles.firstLegendRow : null,
          pressed ? styles.pressed : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.pubName}, rank ${index + 1}`}
      >
        <View style={[styles.rankBadge, isFirst ? styles.firstRankBadge : null]}>
          {isFirst ? (
            <Crown color={colors.background} size={18} />
          ) : (
            <Text style={styles.rankText}>{index + 1}</Text>
          )}
        </View>

        <View style={styles.legendBody}>
          <View style={styles.legendTitleRow}>
            <Text style={styles.pubName} numberOfLines={1}>{item.pubName}</Text>
            <ChevronRight color={colors.textMuted} size={19} />
          </View>
          <View style={styles.locationRow}>
            <MapPin color={colors.textMuted} size={14} />
            <Text style={styles.locationText} numberOfLines={1}>{getPubLocation(item)}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Beer color={colors.primary} size={14} />
              <Text style={styles.statText}>{item.sessionCount} posts</Text>
            </View>
            <View style={styles.statPill}>
              <Users color={colors.primary} size={14} />
              <Text style={styles.statText}>{item.uniqueDrinkerCount} drinkers</Text>
            </View>
          </View>
          <Text style={styles.championText} numberOfLines={2}>
            <Text style={styles.championLabel}>King of the Pub: </Text>
            {formatChampion(item)}
          </Text>
        </View>
      </Pressable>
    );
  }, [openLegend]);

  const renderFriendLeader = useCallback(({ item }: { item: FriendPubWatchEntry }) => {
    const isStreak = friendLeaderboardMode === 'active-streaks';
    const metric = isStreak
      ? formatStreakDays(item.currentStreak)
      : formatHoursSinceLastDrink(item.hoursSinceLastDrink);
    const secondary = formatLastDrinkDate(item.latestDrinkAt);

    return (
      <Pressable
        onPress={() => {
          if (item.userId === 'unknown') return;
          hapticLight();
          navigation.getParent()?.navigate('UserProfile', { userId: item.userId });
        }}
        style={({ pressed }) => [styles.friendLeaderRow, pressed ? styles.pressed : null]}
        accessibilityRole="button"
        accessibilityLabel={`${getDisplayName(item)}, rank ${item.rank}, ${metric}`}
      >
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{item.rank}</Text>
        </View>
        <CachedImage
          uri={item.avatarUrl}
          fallbackUri={`https://i.pravatar.cc/150?u=${item.userId}`}
          style={styles.friendLeaderAvatar}
          recyclingKey={`friend-leader-${friendLeaderboardMode}-${item.userId}-${item.avatarUrl || 'fallback'}`}
          accessibilityLabel={`${getDisplayName(item)}'s avatar`}
        />
        <View style={styles.friendLeaderBody}>
          <Text style={styles.username} numberOfLines={1}>{getDisplayName(item)}</Text>
          <Text style={styles.metaText} numberOfLines={1}>{secondary}</Text>
        </View>
        <Text
          style={[styles.friendLeaderMetric, isStreak ? styles.friendTileMetricStreak : styles.friendTileMetricOverdue]}
          numberOfLines={1}
        >
          {metric}
        </Text>
      </Pressable>
    );
  }, [friendLeaderboardMode, navigation]);

  const renderChallenge = useCallback(({ item }: { item: ChallengeSummary }) => {
    const isJoining = joiningChallengeIds.has(item.id);
    const actionLabel = item.joined ? 'Joined' : item.joinOpen ? 'Join' : 'View';
    const statusLabel = formatChallengeStatusLabel(item.status);
    const entrantsLabel = `${item.entrantsCount} entered`;
    const progressLabel = item.joined
      ? (
          isLeaderboardChallenge(item)
            ? ` - ${formatChallengeRank(item.currentUserRank)} - ${formatChallengeProgress(item.currentUserProgress, item.targetValue, item.challengeType, item.metricType)}`
            : ` - ${formatChallengeRank(item.currentUserRank)} - ${formatChallengeProgress(item.currentUserProgress, item.targetValue, item.challengeType, item.metricType)}`
        )
      : '';

    return (
      <Pressable
        onPress={() => openChallenge(item)}
        style={({ pressed }) => [styles.challengeRow, pressed ? styles.pressed : null]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.entrantsCount} entrants`}
      >
        <View style={styles.challengeIcon}>
          <Trophy color={colors.primary} size={18} />
        </View>
        <View style={styles.challengeBody}>
          <Text style={styles.challengeTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.challengeMeta} numberOfLines={1}>
            {`${statusLabel} - ${entrantsLabel}${progressLabel}`}
          </Text>
        </View>
        <Pressable
          style={[styles.challengeAction, item.joined ? styles.challengeActionJoined : null]}
          onPress={(event) => {
            event.stopPropagation();
            if (item.joined || !item.joinOpen) {
              openChallenge(item);
              return;
            }
            handleJoinChallenge(item);
          }}
          disabled={isJoining}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${item.title}`}
        >
          <Text style={[styles.challengeActionText, item.joined ? styles.challengeActionTextJoined : null]}>
            {isJoining ? '...' : actionLabel}
          </Text>
        </Pressable>
      </Pressable>
    );
  }, [handleJoinChallenge, joiningChallengeIds, openChallenge]);

  const renderHeader = useCallback(() => (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Trophy color={colors.primary} size={28} />
        <Text style={styles.title}>Pub Legends</Text>
      </View>
      <Text style={styles.subtitle}>The busiest bars, ranked by published posts.</Text>
      <View style={styles.segmentedControl}>
        <Pressable
          style={[styles.segmentButton, activeSegment === 'pub-legends' ? styles.segmentButtonActive : null]}
          onPress={() => setActiveSegment('pub-legends')}
          accessibilityRole="button"
          accessibilityState={{ selected: activeSegment === 'pub-legends' }}
        >
          <Text style={[styles.segmentText, activeSegment === 'pub-legends' ? styles.segmentTextActive : null]}>
            Pub Legends
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentButton, activeSegment === 'challenges' ? styles.segmentButtonActive : null]}
          onPress={() => setActiveSegment('challenges')}
          accessibilityRole="button"
          accessibilityState={{ selected: activeSegment === 'challenges' }}
        >
          <Text style={[styles.segmentText, activeSegment === 'challenges' ? styles.segmentTextActive : null]}>
            Challenges
          </Text>
        </Pressable>
      </View>
      {activeSegment === 'pub-legends' ? (
        <View style={styles.friendWatchBlock}>
          <View style={styles.friendWatchHeader}>
            <Text style={styles.friendWatchTitle}>Friends on Watch</Text>
            {friendLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          {friendErrorMessage ? (
            <View style={styles.friendWatchError}>
              <Text style={styles.friendWatchErrorText}>{friendErrorMessage}</Text>
            </View>
          ) : (
            <View style={styles.friendSpotlightGrid}>
              {renderFriendSpotlightTile('active-streaks', 'Hottest streak', hottestStreak, 'No active streaks')}
              {renderFriendSpotlightTile('most-overdue', 'Most overdue', mostOverdue, 'No one exposed')}
            </View>
          )}
        </View>
      ) : null}
      {legends[0] ? (
        <View style={styles.heroStrip}>
          <View style={styles.heroIcon}>
            <Crown color={colors.background} size={21} />
          </View>
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroLabel}>Current hotspot</Text>
            <Text style={styles.heroTitle} numberOfLines={1}>{legends[0].pubName}</Text>
          </View>
          <Text style={styles.heroMetric}>{legends[0].sessionCount}</Text>
        </View>
      ) : null}
    </View>
  ), [
    activeSegment,
    friendErrorMessage,
    friendLoading,
    hottestStreak,
    legends,
    mostOverdue,
    renderFriendSpotlightTile,
  ]);

  const renderFriendListHeader = useCallback(() => {
    const title = friendLeaderboardMode === 'active-streaks'
      ? 'Active streaks among friends'
      : 'Most overdue among friends';
    return (
      <View style={styles.friendListHeader}>
        {renderHeader()}
        <View style={styles.friendListToolbar}>
          <Pressable
            onPress={closeFriendLeaderboard}
            style={({ pressed }) => [styles.backToPubsChip, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel="Back to pubs"
          >
            <ArrowLeft color={colors.primary} size={15} />
            <Text style={styles.backToPubsText}>Back to pubs</Text>
          </Pressable>
          <Text style={styles.friendListTitle}>{title}</Text>
        </View>
      </View>
    );
  }, [closeFriendLeaderboard, friendLeaderboardMode, renderHeader]);

  return (
    <View style={styles.container}>
      {loading && !refreshing ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : activeSegment === 'pub-legends' && friendLeaderboardMode !== 'pubs' ? (
        <FlatList
          data={activeFriendRows}
          keyExtractor={(item) => `${item.leaderboardType}-${item.userId}`}
          renderItem={renderFriendLeader}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, activeFriendRows.length === 0 ? styles.emptyContent : null]}
          refreshControl={<RefreshControl refreshing={refreshing || friendLoading} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={renderFriendListHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <EmptyIllustration kind="trophy" size={170} />
              <Text style={styles.emptyTitle}>{friendErrorMessage ? 'Could not load friend leaderboards' : 'No friend data yet'}</Text>
              <Text style={styles.emptyText}>{friendErrorMessage || 'Follow friends to start the watchlist.'}</Text>
            </View>
          }
        />
      ) : activeSegment === 'pub-legends' ? (
        <FlatList
          data={legends}
          keyExtractor={(item) => item.pubKey}
          renderItem={renderLegend}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, legends.length === 0 ? styles.emptyContent : null]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <EmptyIllustration kind="trophy" size={170} />
              <Text style={styles.emptyTitle}>{legendsErrorMessage ? 'Could not load Pub Legends' : 'No pub legends yet'}</Text>
              <Text style={styles.emptyText}>{legendsErrorMessage || 'Published sessions with pubs will appear here.'}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(item) => item.id}
          renderItem={renderChallenge}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, challenges.length === 0 ? styles.emptyContent : null]}
          refreshControl={<RefreshControl refreshing={challengesLoading} onRefresh={loadChallenges} tintColor={colors.primary} />}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <EmptyIllustration kind="trophy" size={170} />
              <Text style={styles.emptyTitle}>{challengesErrorMessage ? 'Could not load Challenges' : 'No challenges yet'}</Text>
              <Text style={styles.emptyText}>{challengesErrorMessage || 'Official Beerva challenges will appear here.'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: Platform.OS === 'web' ? 18 : 58,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'web'
      ? floatingTabBarMetrics.webContentInset
      : floatingTabBarMetrics.nativeContentInset,
    gap: spacing.md,
  },
  emptyContent: {
    flexGrow: 1,
  },
  header: {
    gap: spacing.sm,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 28,
    color: colors.primary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  segmentedControl: {
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 3,
    flexDirection: 'row',
  },
  segmentButton: {
    flex: 1,
    minHeight: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primarySoft,
  },
  segmentText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: colors.primary,
  },
  heroStrip: {
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroLabel: {
    ...typography.tiny,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  heroTitle: {
    ...typography.h3,
    marginTop: 2,
  },
  heroMetric: {
    ...typography.h2,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  legendRow: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...shadows.card,
  },
  firstLegendRow: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceRaised,
  },
  challengeRow: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadows.card,
  },
  challengeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeBody: {
    flex: 1,
    minWidth: 0,
  },
  challengeTitle: {
    ...typography.h3,
    color: colors.text,
  },
  challengeMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  challengeAction: {
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeActionJoined: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  challengeActionText: {
    ...typography.tiny,
    color: colors.background,
    fontWeight: '900',
  },
  challengeActionTextJoined: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.995 }],
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  firstRankBadge: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rankText: {
    ...typography.h3,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  legendBody: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  legendTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pubName: {
    ...typography.h3,
    flex: 1,
    minWidth: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationText: {
    ...typography.caption,
    flex: 1,
    minWidth: 0,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statPill: {
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statText: {
    ...typography.tiny,
    color: colors.text,
  },
  championText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  championLabel: {
    color: colors.primary,
    fontWeight: '800',
  },
  friendWatchBlock: {
    gap: 8,
  },
  friendWatchHeader: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  friendWatchTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  friendWatchError: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendWatchErrorText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  friendSpotlightGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  friendSpotlightTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  friendSpotlightTileStreak: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  friendSpotlightTileOverdue: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(239, 68, 68, 0.28)',
  },
  friendTileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  friendTileLabel: {
    ...typography.tiny,
    textTransform: 'uppercase',
    fontWeight: '900',
    flex: 1,
    minWidth: 0,
  },
  friendTileLabelStreak: {
    color: colors.primary,
  },
  friendTileLabelOverdue: {
    color: colors.danger,
  },
  friendTileMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  friendTileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
  },
  friendTileAvatarEmpty: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendTileCopy: {
    flex: 1,
    minWidth: 0,
  },
  friendTileName: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
  },
  friendTileMetric: {
    ...typography.h3,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  friendTileMetricStreak: {
    color: colors.primary,
  },
  friendTileMetricOverdue: {
    color: colors.danger,
  },
  friendListHeader: {
    gap: spacing.md,
  },
  friendListToolbar: {
    gap: 8,
  },
  backToPubsChip: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  backToPubsText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '900',
  },
  friendListTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  friendLeaderRow: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadows.card,
  },
  friendLeaderAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
  },
  friendLeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    ...typography.h3,
    fontSize: 16,
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  friendLeaderMetric: {
    ...typography.h3,
    minWidth: 54,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
});
