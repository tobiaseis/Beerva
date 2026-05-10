import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Beer, Crown, Trophy, User } from 'lucide-react-native';

import { CachedImage } from '../components/CachedImage';
import { EmptyIllustration } from '../components/EmptyIllustration';
import { formatTruePints, PubKingSession } from '../lib/pubLegends';
import { fetchKingOfThePub } from '../lib/pubLegendsApi';
import { hapticLight } from '../lib/haptics';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const formatSessionDate = (value?: string | null) => {
  if (!value) return 'Session date unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Session date unknown';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const PubLegendDetailScreen = ({ navigation, route }: any) => {
  const pubKey = route?.params?.pubKey as string | undefined;
  const pubName = (route?.params?.pubName as string | undefined) || 'Pub';
  const [leaders, setLeaders] = useState<PubKingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const hasLoadedOnce = useRef(false);

  const loadLeaders = useCallback(async () => {
    if (!pubKey) {
      setLeaders([]);
      setErrorMessage('This pub is missing its leaderboard key.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      if (!hasLoadedOnce.current) {
        setLoading(true);
      }
      setErrorMessage(null);
      const rows = await fetchKingOfThePub(pubKey);
      if (requestId !== requestIdRef.current) return;
      setLeaders(rows);
    } catch (error) {
      console.error('King of the Pub fetch error:', error);
      if (requestId === requestIdRef.current) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load King of the Pub.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        hasLoadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [pubKey]);

  useFocusEffect(
    useCallback(() => {
      loadLeaders();
    }, [loadLeaders])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLeaders();
  }, [loadLeaders]);

  const openProfile = useCallback((userId: string) => {
    if (userId === 'unknown') return;
    hapticLight();
    navigation.navigate('UserProfile', { userId });
  }, [navigation]);

  const champion = leaders[0] || null;

  const renderLeader = useCallback(({ item }: { item: PubKingSession }) => {
    const isChampion = item.rank === 1;
    return (
      <Pressable
        onPress={() => openProfile(item.userId)}
        style={({ pressed }) => [
          styles.leaderRow,
          isChampion ? styles.championRow : null,
          pressed ? styles.pressed : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.username || 'Beer Lover'}, rank ${item.rank}`}
      >
        <View style={[styles.rankBadge, isChampion ? styles.championRankBadge : null]}>
          {isChampion ? <Crown color={colors.background} size={18} /> : <Text style={styles.rankText}>{item.rank}</Text>}
        </View>

        <CachedImage
          uri={item.avatarUrl}
          fallbackUri={`https://i.pravatar.cc/150?u=${item.userId}`}
          style={styles.avatar}
          recyclingKey={`pub-king-${item.userId}-${item.avatarUrl || 'fallback'}`}
          accessibilityLabel={`${item.username || 'Beer Lover'}'s avatar`}
        />

        <View style={styles.leaderBody}>
          <Text style={styles.username} numberOfLines={1}>{item.username || 'Beer Lover'}</Text>
          <Text style={styles.metaText} numberOfLines={1}>{formatSessionDate(item.sessionStartedAt)}</Text>
          <View style={styles.leaderStats}>
            <View style={styles.statPill}>
              <Beer color={colors.primary} size={14} />
              <Text style={styles.statText}>{formatTruePints(item.truePints)}</Text>
            </View>
            <View style={styles.statPill}>
              <User color={colors.primary} size={14} />
              <Text style={styles.statText}>{item.drinkCount} drinks</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }, [openProfile]);

  const renderHeader = useCallback(() => (
    <View style={styles.headerBlock}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={colors.text} size={22} />
        </Pressable>
        <Text style={styles.screenTitle} numberOfLines={1}>Pub Legends</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <View style={styles.pubHeader}>
        <View style={styles.titleIcon}>
          <Trophy color={colors.background} size={24} />
        </View>
        <View style={styles.pubTitleBlock}>
          <Text style={styles.kicker}>King of the Pub</Text>
          <Text style={styles.pubTitle} numberOfLines={2}>{pubName}</Text>
        </View>
      </View>

      {champion ? (
        <View style={styles.championCard}>
          <View style={styles.crownCircle}>
            <Crown color={colors.background} size={26} />
          </View>
          <View style={styles.championCopy}>
            <Text style={styles.championKicker}>Current king</Text>
            <Text style={styles.championName} numberOfLines={1}>{champion.username || 'Beer Lover'}</Text>
            <Text style={styles.championScore}>{formatTruePints(champion.truePints)}</Text>
            <Text style={styles.metaText}>{formatSessionDate(champion.sessionStartedAt)}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Top sessions</Text>
    </View>
  ), [champion, navigation, pubName]);

  return (
    <View style={styles.container}>
      {loading && !refreshing ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={leaders}
          keyExtractor={(item) => item.sessionId}
          renderItem={renderLeader}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, leaders.length === 0 ? styles.emptyContent : null]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <EmptyIllustration kind="trophy" size={170} />
              <Text style={styles.emptyTitle}>{errorMessage ? 'Could not load the crown' : 'No King of the Pub yet'}</Text>
              <Text style={styles.emptyText}>{errorMessage || 'Published sessions at this pub will compete here.'}</Text>
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
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'web' ? 28 : 32,
    gap: spacing.md,
  },
  emptyContent: {
    flexGrow: 1,
  },
  headerBlock: {
    gap: spacing.md,
  },
  topBar: {
    paddingTop: Platform.OS === 'web' ? 18 : 54,
    paddingBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
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
    flex: 1,
    textAlign: 'center',
  },
  pubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  pubTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    ...typography.tiny,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  pubTitle: {
    ...typography.h2,
    marginTop: 2,
  },
  championCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceRaised,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...shadows.raised,
  },
  crownCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  championCopy: {
    flex: 1,
    minWidth: 0,
  },
  championKicker: {
    ...typography.tiny,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  championName: {
    ...typography.h3,
    marginTop: 3,
  },
  championScore: {
    ...typography.h2,
    color: colors.primary,
    marginTop: 2,
  },
  sectionLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  leaderRow: {
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
  championRow: {
    borderColor: colors.primaryBorder,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.995 }],
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  championRankBadge: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rankText: {
    ...typography.h3,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
  },
  leaderBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  username: {
    ...typography.h3,
    fontSize: 16,
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  leaderStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 4,
  },
  statPill: {
    minHeight: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statText: {
    ...typography.tiny,
    color: colors.text,
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
