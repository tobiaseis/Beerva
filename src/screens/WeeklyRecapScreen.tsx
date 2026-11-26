import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
  ArrowLeft,
  Beer,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  MapPin,
  MessageCircle,
  RefreshCw,
  Trophy,
} from 'lucide-react-native';
import { CachedImage } from '../components/CachedImage';
import { formatChallengeProgress, formatChallengeRank } from '../lib/challenges';
import { fetchWeeklyRecap, formatWeekRange, isRecapEmpty, shiftWeek, WeeklyRecap } from '../lib/weeklyRecap';
import { formatNightsInARow, formatWeeklyStreak } from '../lib/weeklyStreaks';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';
import { typography } from '../theme/typography';
import { usePwaParityInsets } from '../theme/usePwaParityInsets';

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (
  `${count} ${count === 1 ? singular : pluralForm}`
);

const StatTile = ({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) => (
  <View style={styles.tile}>
    {icon}
    <Text style={styles.tileValue} numberOfLines={1}>{value}</Text>
    <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
  </View>
);

export const WeeklyRecapScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { screenTopBarPaddingTop } = usePwaParityInsets();
  const routeWeek = typeof route?.params?.weekStart === 'string' ? route.params.weekStart : null;

  const [selectedWeek, setSelectedWeek] = useState<string | null>(routeWeek);
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setErrorMessage(null);
      fetchWeeklyRecap(selectedWeek)
        .then((next) => {
          if (!cancelled) setRecap(next);
        })
        .catch((error) => {
          console.error('Weekly recap error:', error);
          if (!cancelled) setErrorMessage('Couldn’t load your week.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [selectedWeek, reloadToken])
  );

  const goToWeek = useCallback((weeks: number) => {
    if (!recap?.weekStart) return;
    setSelectedWeek(shiftWeek(recap.weekStart, weeks));
  }, [recap?.weekStart]);

  const renderBody = () => {
    if (loading && !recap) {
      return <ActivityIndicator style={styles.loader} color={colors.primary} />;
    }

    if (errorMessage) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.mutedText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setReloadToken((value) => value + 1)}>
            <RefreshCw color={colors.background} size={15} />
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!recap) return null;

    if (isRecapEmpty(recap)) {
      return (
        <View style={styles.centerState}>
          <Beer color={colors.textMuted} size={30} />
          <Text style={styles.emptyTitle}>Quiet week</Text>
          <Text style={styles.mutedText}>Nobody you follow logged a night out this week.</Text>
          {recap.isCurrentWeek ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Record' })}>
              <Beer color={colors.background} size={15} />
              <Text style={styles.primaryButtonText}>Log a night</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    return (
      <>
        <View style={styles.hero}>
          <Text style={styles.heroValue}>{plural(recap.nightsOut, 'night')} out</Text>
          <Text style={styles.heroMeta}>
            {recap.units.toFixed(1)} units · {plural(recap.drinks, 'drink')} · {plural(recap.posts, 'post')}
          </Text>
        </View>

        <View style={styles.tiles}>
          <StatTile icon={<Eye color={colors.primary} size={18} />} value={String(recap.seenBy)} label="Seen by" />
          <StatTile icon={<Beer color={colors.primary} size={18} />} value={String(recap.cheers)} label="Cheers" />
          <StatTile icon={<MessageCircle color={colors.primary} size={18} />} value={String(recap.comments)} label="Comments" />
          <StatTile
            icon={<MapPin color={colors.primary} size={18} />}
            value={String(recap.pubs)}
            label={recap.topPub ? `Pubs · top: ${recap.topPub}` : 'Pubs'}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <CalendarCheck color={colors.primary} size={18} />
            <Text style={styles.cardTitle}>
              {recap.weeklyStreak > 0 ? formatWeeklyStreak(recap.weeklyStreak) : 'No weekly streak yet'}
            </Text>
          </View>
          {recap.bestRun >= 2 ? (
            <Text style={styles.cardMeta}>Best run: 🔥 {formatNightsInARow(recap.bestRun)}</Text>
          ) : null}
        </View>

        {recap.challenges.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Trophy color={colors.primary} size={18} />
              <Text style={styles.cardTitle}>Challenges</Text>
            </View>
            {recap.challenges.map((challenge) => (
              <TouchableOpacity
                key={challenge.slug}
                style={styles.listRow}
                onPress={() => navigation.navigate('ChallengeDetail', { challengeSlug: challenge.slug })}
                activeOpacity={0.75}
              >
                <Text style={styles.listTitle} numberOfLines={1}>{challenge.title}</Text>
                <Text style={styles.listMeta}>
                  {formatChallengeRank(challenge.rank)} of {challenge.entrants} · {formatChallengeProgress(challenge.progressValue, null, 'leaderboard', challenge.metricType)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {recap.mates.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Who was out</Text>
            {recap.mates.map((mate) => (
              <TouchableOpacity
                key={mate.userId}
                style={styles.mateRow}
                onPress={() => navigation.navigate('UserProfile', { userId: mate.userId })}
                activeOpacity={0.75}
              >
                <CachedImage
                  uri={mate.avatarUrl}
                  fallbackUri={`https://i.pravatar.cc/150?u=${mate.userId}`}
                  style={styles.mateAvatar}
                  recyclingKey={`recap-mate-${mate.userId}-${mate.avatarUrl || 'fallback'}`}
                  accessibilityLabel={`${mate.username || 'Someone'}'s avatar`}
                />
                <Text style={styles.listTitle} numberOfLines={1}>{mate.username || 'Someone'}</Text>
                <Text style={styles.listMeta}>{plural(mate.nightsOut, 'night')} out</Text>
              </TouchableOpacity>
            ))}
            {recap.matesOut > recap.mates.length ? (
              <Text style={styles.cardMeta}>+{recap.matesOut - recap.mates.length} more</Text>
            ) : null}
          </View>
        ) : null}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: screenTopBarPaddingTop }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={colors.text} size={21} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Your week</Text>
        <View style={styles.iconButtonPlaceholder} />
      </View>

      <View style={styles.weekPicker}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => goToWeek(-1)}
          disabled={!recap}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
        >
          <ChevronLeft color={colors.text} size={20} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>
          {recap ? formatWeekRange(recap.weekStart, recap.weekEnd) : ' '}
        </Text>
        <TouchableOpacity
          style={[styles.iconButton, !recap || recap.isCurrentWeek ? styles.iconButtonDisabled : null]}
          onPress={() => goToWeek(1)}
          disabled={!recap || recap.isCurrentWeek}
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <ChevronRight color={colors.text} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {renderBody()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screenTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  iconButtonDisabled: {
    opacity: 0.35,
  },
  iconButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  weekPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  weekLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  loader: {
    marginTop: 48,
  },
  centerState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  emptyTitle: {
    ...typography.h3,
  },
  mutedText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 14,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  heroValue: {
    ...typography.h1,
    color: colors.primary,
  },
  heroMeta: {
    ...typography.bodyMuted,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 14,
    gap: 4,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  tileValue: {
    ...typography.h2,
    color: colors.text,
  },
  tileLabel: {
    ...typography.caption,
  },
  card: {
    padding: 14,
    gap: 8,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  cardMeta: {
    ...typography.caption,
  },
  listRow: {
    gap: 2,
    paddingVertical: 6,
  },
  listTitle: {
    ...typography.body,
    color: colors.text,
    flexShrink: 1,
  },
  listMeta: {
    ...typography.caption,
  },
  mateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  mateAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});
