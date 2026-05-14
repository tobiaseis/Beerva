import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Beer, ChevronRight, Crown, MapPin, Trophy, Users } from 'lucide-react-native';

import { EmptyIllustration } from '../components/EmptyIllustration';
import { ChallengeSummary, formatChallengeProgress, formatChallengeRank, formatChallengeStatusLabel } from '../lib/challenges';
import { fetchOfficialChallenges, joinChallenge } from '../lib/challengesApi';
import { formatTruePints, PubLegend } from '../lib/pubLegends';
import { fetchPubLegends } from '../lib/pubLegendsApi';
import { hapticLight } from '../lib/haptics';
import { colors } from '../theme/colors';
import { floatingTabBarMetrics, radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const getPubLocation = (item: PubLegend) => item.city || item.address || 'Pub';

const formatChampion = (item: PubLegend) => {
  if (!item.championUserId) return 'No champion yet';
  return `${item.championUsername || 'Beer Lover'} - ${formatTruePints(item.topTruePints)}`;
};

export const PubLegendsScreen = ({ navigation }: any) => {
  const [activeSegment, setActiveSegment] = useState<'pub-legends' | 'challenges'>('pub-legends');
  const [legends, setLegends] = useState<PubLegend[]>([]);
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [legendsErrorMessage, setLegendsErrorMessage] = useState<string | null>(null);
  const [challengesErrorMessage, setChallengesErrorMessage] = useState<string | null>(null);
  const [joiningChallengeIds, setJoiningChallengeIds] = useState<Set<string>>(() => new Set());
  const requestIdRef = useRef(0);
  const hasLoadedOnce = useRef(false);

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

  useFocusEffect(
    useCallback(() => {
      loadLegends();
      loadChallenges();
    }, [loadChallenges, loadLegends])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLegends();
  }, [loadLegends]);

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
      pubName: item.pubName,
    });
  }, [navigation]);

  const openChallenge = useCallback((challenge: ChallengeSummary) => {
    hapticLight();
    navigation.getParent()?.navigate('ChallengeDetail', { challengeSlug: challenge.slug });
  }, [navigation]);

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

  const renderChallenge = useCallback(({ item }: { item: ChallengeSummary }) => {
    const isJoining = joiningChallengeIds.has(item.id);
    const actionLabel = item.joined ? 'Joined' : item.joinOpen ? 'Join' : 'View';
    const statusLabel = formatChallengeStatusLabel(item.status);
    const entrantsLabel = `${item.entrantsCount} entered`;
    const progressLabel = item.joined
      ? ` - ${formatChallengeRank(item.currentUserRank)} - ${formatChallengeProgress(item.currentUserProgress, item.targetValue)}`
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
  ), [activeSegment, legends]);

  return (
    <View style={styles.container}>
      {loading && !refreshing ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
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
    paddingBottom: Platform.OS === 'web' ? floatingTabBarMetrics.webContentInset : 92,
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
