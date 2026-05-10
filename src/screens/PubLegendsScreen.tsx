import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Beer, ChevronRight, Crown, MapPin, Trophy, Users } from 'lucide-react-native';

import { EmptyIllustration } from '../components/EmptyIllustration';
import { formatTruePints, PubLegend } from '../lib/pubLegends';
import { fetchPubLegends } from '../lib/pubLegendsApi';
import { hapticLight } from '../lib/haptics';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const getPubLocation = (item: PubLegend) => item.city || item.address || 'Pub';

const formatChampion = (item: PubLegend) => {
  if (!item.championUserId) return 'No champion yet';
  return `${item.championUsername || 'Beer Lover'} - ${formatTruePints(item.topTruePints)}`;
};

export const PubLegendsScreen = ({ navigation }: any) => {
  const [legends, setLegends] = useState<PubLegend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const hasLoadedOnce = useRef(false);

  const loadLegends = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      if (!hasLoadedOnce.current) {
        setLoading(true);
      }
      setErrorMessage(null);
      const rows = await fetchPubLegends();
      if (requestId !== requestIdRef.current) return;
      setLegends(rows);
    } catch (error) {
      console.error('Pub Legends fetch error:', error);
      if (requestId === requestIdRef.current) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load Pub Legends.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        hasLoadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLegends();
    }, [loadLegends])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLegends();
  }, [loadLegends]);

  const openLegend = useCallback((item: PubLegend) => {
    hapticLight();
    navigation.getParent()?.navigate('PubLegendDetail', {
      pubKey: item.pubKey,
      pubName: item.pubName,
    });
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

  const renderHeader = useCallback(() => (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Trophy color={colors.primary} size={28} />
        <Text style={styles.title}>Pub Legends</Text>
      </View>
      <Text style={styles.subtitle}>The busiest bars, ranked by published posts.</Text>
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
  ), [legends]);

  return (
    <View style={styles.container}>
      {loading && !refreshing ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
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
              <Text style={styles.emptyTitle}>{errorMessage ? 'Could not load Pub Legends' : 'No pub legends yet'}</Text>
              <Text style={styles.emptyText}>{errorMessage || 'Published sessions with pubs will appear here.'}</Text>
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
    paddingBottom: Platform.OS === 'web' ? 28 : 92,
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
