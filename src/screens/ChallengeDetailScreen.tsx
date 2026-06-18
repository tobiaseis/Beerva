import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Check, Trophy, Users, X } from 'lucide-react-native';

import { CachedImage } from '../components/CachedImage';
import {
  CHALLENGE_LEADERBOARD_SCOPE,
  CHALLENGE_STATUS,
  CHALLENGE_TYPE,
  ChallengeDetail,
  ChallengeLeaderboardEntry,
  ChallengeLeaderboardScope,
  formatChallengeProgress,
  formatChallengeRank,
  getChallengePreJoinCopy,
  getLeaderboardEntryMeta,
} from '../lib/challenges';
import { fetchChallengeDetail, joinChallenge } from '../lib/challengesApi';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type ChallengeDetailRouteParams = {
  challengeSlug?: string;
};

const CHALLENGE_AUTO_REFRESH_INTERVAL_MS = 20000;
const CHALLENGE_LEADERBOARD_SCOPES: { key: ChallengeLeaderboardScope; label: string }[] = [
  { key: CHALLENGE_LEADERBOARD_SCOPE.LOCAL, label: 'Local' },
  { key: CHALLENGE_LEADERBOARD_SCOPE.GLOBAL, label: 'Global' },
];

type LoadChallengeOptions = {
  silent?: boolean;
  skipIfInFlight?: boolean;
};

export const ChallengeDetailScreen = ({ navigation, route }: any) => {
  const { challengeSlug } = (route?.params || {}) as ChallengeDetailRouteParams;
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [leaderboardScope, setLeaderboardScope] = useState<ChallengeLeaderboardScope>(CHALLENGE_LEADERBOARD_SCOPE.LOCAL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const hasLoadedOnce = useRef(false);
  const challengeRef = useRef<ChallengeDetail | null>(null);
  const requestInFlightRef = useRef(false);

  const activeLeaderboard = challenge?.leaderboards[leaderboardScope] || null;

  useEffect(() => {
    setLeaderboardScope(CHALLENGE_LEADERBOARD_SCOPE.LOCAL);
  }, [challengeSlug]);

  const loadChallenge = useCallback(async (options: LoadChallengeOptions = {}) => {
    if (options.skipIfInFlight && requestInFlightRef.current) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!challengeSlug) {
      challengeRef.current = null;
      setChallenge(null);
      setErrorMessage('This challenge is missing its route.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    requestInFlightRef.current = true;

    try {
      if (!hasLoadedOnce.current && !options.silent) {
        setLoading(true);
      }
      if (!options.silent) {
        setErrorMessage(null);
      }
      const detail = await fetchChallengeDetail(challengeSlug);
      if (requestId !== requestIdRef.current) return;
      challengeRef.current = detail;
      setChallenge(detail);
      setErrorMessage(null);
    } catch (error) {
      console.error('Challenge detail fetch error:', error);
      if (requestId === requestIdRef.current && !options.silent) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load challenge.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        requestInFlightRef.current = false;
        hasLoadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [challengeSlug]);

  useFocusEffect(
    useCallback(() => {
      loadChallenge();

      const refreshInterval = setInterval(() => {
        const currentChallenge = challengeRef.current;
        if (
          currentChallenge?.challengeType === CHALLENGE_TYPE.LEADERBOARD
          && currentChallenge.status === CHALLENGE_STATUS.ACTIVE
        ) {
          loadChallenge({ silent: true, skipIfInFlight: true });
        }
      }, CHALLENGE_AUTO_REFRESH_INTERVAL_MS);

      return () => {
        requestIdRef.current += 1;
        requestInFlightRef.current = false;
        clearInterval(refreshInterval);
      };
    }, [loadChallenge])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadChallenge();
  }, [loadChallenge]);

  const handleJoin = useCallback(async () => {
    if (!challenge || joining || challenge.joined || !challenge.joinOpen) return;

    try {
      setJoining(true);
      setErrorMessage(null);
      await joinChallenge(challenge.id);
      await loadChallenge();
    } catch (error) {
      console.error('Join challenge error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Could not join challenge.');
    } finally {
      setJoining(false);
    }
  }, [challenge, joining, loadChallenge]);

  const renderLeader = useCallback(({ item }: { item: ChallengeLeaderboardEntry }) => (
    <View style={styles.leaderRow}>
      <Text style={styles.rankText}>{formatChallengeRank(item.rank)}</Text>
      <CachedImage
        uri={item.avatarUrl}
        fallbackUri={`https://i.pravatar.cc/150?u=${item.userId}`}
        style={styles.avatar}
        recyclingKey={`challenge-${item.userId}-${item.avatarUrl || 'fallback'}`}
        accessibilityLabel={`${item.username || 'Beer Lover'} avatar`}
      />
      <View style={styles.leaderCopy}>
        <Text style={styles.leaderName} numberOfLines={1}>{item.username || 'Beer Lover'}</Text>
        <Text style={styles.leaderMeta}>{getLeaderboardEntryMeta(item, challenge || { challengeType: 'target' })}</Text>
      </View>
      <Text style={styles.progressText}>
        {formatChallengeProgress(item.progressValue, challenge?.targetValue, challenge?.challengeType, challenge?.metricType)}
      </Text>
    </View>
  ), [challenge]);

  const renderHeader = useCallback(() => (
    <View style={styles.headerBlock}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={colors.text} size={21} />
        </Pressable>
        <Text style={styles.screenTitle} numberOfLines={1}>Challenges</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {challenge ? (
        <>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Trophy color={colors.background} size={22} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.title}>{challenge.title}</Text>
              <Text style={styles.description}>{challenge.description}</Text>
            </View>
          </View>

          {challenge.joined ? (
            <View style={styles.summaryRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>{challenge.challengeType === 'leaderboard' ? 'Your total' : 'Your progress'}</Text>
                <Text style={styles.summaryValue}>
                  {formatChallengeProgress(challenge.currentUserProgress, challenge.targetValue, challenge.challengeType, challenge.metricType)}
                </Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>Rank</Text>
                <Text style={styles.summaryValue}>{formatChallengeRank(activeLeaderboard?.currentUserRank)}</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>Entered</Text>
                <Text style={styles.summaryValue}>{activeLeaderboard?.entrantsCount ?? 0}</Text>
              </View>
            </View>
          ) : challenge.joinOpen ? (
            <View style={styles.preJoinSummary}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>Entered</Text>
                <Text style={styles.summaryValue}>{activeLeaderboard?.entrantsCount ?? 0}</Text>
              </View>
              <Text style={styles.preJoinText}>
                {getChallengePreJoinCopy(challenge)}
              </Text>
            </View>
          ) : (
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Entered</Text>
              <Text style={styles.summaryValue}>{activeLeaderboard?.entrantsCount ?? 0}</Text>
            </View>
          )}

          {challenge.joined ? (
            <View style={styles.joinedBadge}>
              <Check color={colors.primary} size={15} />
              <Text style={styles.joinedText}>Joined</Text>
            </View>
          ) : challenge.joinOpen ? (
            <Pressable
              style={({ pressed }) => [styles.joinButtonCompact, pressed ? styles.pressed : null]}
              onPress={handleJoin}
              disabled={joining}
              accessibilityRole="button"
              accessibilityLabel="Join challenge"
            >
              <Text style={styles.joinButtonText}>{joining ? 'Joining...' : 'Join'}</Text>
            </Pressable>
          ) : (
            <View style={styles.closedBadge}>
              <X color={colors.textMuted} size={15} />
              <Text style={styles.closedText}>Closed</Text>
            </View>
          )}

          <View style={styles.leaderboardScopeControl}>
            {CHALLENGE_LEADERBOARD_SCOPES.map((scope) => {
              const selected = leaderboardScope === scope.key;
              return (
                <Pressable
                  key={scope.key}
                  style={[styles.leaderboardScopeButton, selected ? styles.leaderboardScopeButtonActive : null]}
                  onPress={() => setLeaderboardScope(scope.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${scope.label.toLowerCase()} leaderboard`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.leaderboardScopeText, selected ? styles.leaderboardScopeTextActive : null]}>
                    {scope.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.leaderboardHeading}>
            <Users color={colors.primary} size={18} />
            <Text style={styles.leaderboardTitle}>Leaderboard</Text>
          </View>
        </>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </View>
  ), [activeLeaderboard, challenge, errorMessage, handleJoin, joining, leaderboardScope, navigation]);

  const emptyTitle = errorMessage
    ? 'Could not load leaderboard'
    : leaderboardScope === CHALLENGE_LEADERBOARD_SCOPE.LOCAL
      ? 'No local entrants yet'
      : 'No entrants yet';
  const emptyText = errorMessage
    || (
      leaderboardScope === CHALLENGE_LEADERBOARD_SCOPE.LOCAL
        ? 'Mutual followers who join this challenge will appear here.'
        : 'Joined users will appear here.'
    );

  if (loading && !refreshing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={activeLeaderboard?.entries || []}
        keyExtractor={(item) => item.userId}
        renderItem={renderLeader}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, !activeLeaderboard?.entries.length ? styles.emptyContent : null]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        }
      />
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
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: Platform.OS === 'web' ? 18 : 58,
    paddingHorizontal: 16,
    paddingBottom: 110,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  emptyContent: {
    flexGrow: 1,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: 4,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  backButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  screenTitle: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  hero: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    padding: 14,
    ...shadows.card,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  description: {
    ...typography.bodyMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryPill: {
    flex: 1,
    minHeight: 58,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 10,
  },
  preJoinSummary: {
    gap: 8,
  },
  preJoinText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  summaryLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  summaryValue: {
    ...typography.h3,
    color: colors.primary,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  joinButtonCompact: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '800',
  },
  joinedBadge: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  joinedText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '800',
  },
  closedBadge: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  closedText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '800',
  },
  leaderboardScopeControl: {
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 3,
    flexDirection: 'row',
  },
  leaderboardScopeButton: {
    flex: 1,
    minHeight: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardScopeButtonActive: {
    backgroundColor: colors.primarySoft,
  },
  leaderboardScopeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  leaderboardScopeTextActive: {
    color: colors.primary,
  },
  leaderboardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  leaderboardTitle: {
    ...typography.h3,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  leaderRow: {
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadows.card,
  },
  rankText: {
    width: 38,
    ...typography.h3,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
  },
  leaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  leaderName: {
    ...typography.body,
    fontWeight: '800',
  },
  leaderMeta: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  progressText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.995 }],
  },
});
