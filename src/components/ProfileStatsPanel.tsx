import React, { useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Award, Beer, CalendarDays, Flame, MapPin, Moon, PartyPopper, Repeat, Sparkles, Sunrise, Trophy, X } from 'lucide-react-native';

import { getTrophies, Stats, TrophyKind } from '../lib/profileStats';
import { PintTimelinePoint } from '../lib/profileStatsApi';

export const renderTrophyIcon = (kind: TrophyKind, earned: boolean, iconSize = 28) => {
  const iconColor = earned ? colors.primary : colors.textMuted;

  switch (kind) {
    case 'pints':
      return <Beer color={iconColor} size={iconSize} />;
    case 'pubs':
      return <MapPin color={iconColor} size={iconSize} />;
    case 'session':
      return <Trophy color={iconColor} size={iconSize} />;
    case 'abv':
      return <Flame color={iconColor} size={iconSize} />;
    case 'late':
      return <Moon color={iconColor} size={iconSize} />;
    case 'spree':
      return <PartyPopper color={iconColor} size={iconSize} />;
    case 'streak':
      return <Repeat color={iconColor} size={iconSize} />;
    case 'variety':
      return <Sparkles color={iconColor} size={iconSize} />;
    case 'rtd':
      return <Sparkles color={iconColor} size={iconSize} />;
    case 'jager':
      return <Flame color={iconColor} size={iconSize} />;
    case 'sambuca':
      return <Flame color={iconColor} size={iconSize} />;
    case 'morning':
      return <Sunrise color={iconColor} size={iconSize} />;
    case 'calendar':
      return <CalendarDays color={iconColor} size={iconSize} />;
    default:
      return <Award color={iconColor} size={iconSize} />;
  }
};
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { SectionHeader } from './SectionHeader';
import { Surface } from './Surface';

type ProfileStatsPanelProps = {
  stats: Stats;
  pintTimeline?: PintTimelinePoint[];
};

export const ProfileStatsPanel = ({ stats, pintTimeline = [] }: ProfileStatsPanelProps) => {
  const [pintsModalVisible, setPintsModalVisible] = useState(false);
  const trophies = useMemo(() => getTrophies(stats), [stats]);
  const earnedTrophies = useMemo(() => trophies.filter((trophy) => trophy.earned), [trophies]);
  const maxTimelinePints = useMemo(
    () => Math.max(...pintTimeline.map((point) => point.pints), 0),
    [pintTimeline]
  );
  const orderedTrophies = useMemo(() => trophies
    .map((trophy, index) => ({ trophy, index }))
    .sort((a, b) => {
      if (a.trophy.earned !== b.trophy.earned) {
        return a.trophy.earned ? -1 : 1;
      }

      return a.index - b.index;
    })
    .map(({ trophy }) => trophy), [trophies]);

  return (
    <>
      <Surface style={styles.statsContainer}>
        <TouchableOpacity
          style={styles.statBox}
          onPress={() => setPintsModalVisible(true)}
          activeOpacity={0.76}
          accessibilityRole="button"
          accessibilityLabel="Show true pint details"
        >
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {stats.totalPints}
          </Text>
          <Text style={styles.statLabel} numberOfLines={1}>True Pints</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {stats.uniquePubs}
          </Text>
          <Text style={styles.statLabel} numberOfLines={1}>Unique Pubs</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {stats.avgAbv}%
          </Text>
          <Text style={styles.statLabel} numberOfLines={1}>Avg ABV</Text>
        </View>
      </Surface>

      <Surface style={[styles.highScoreContainer, styles.highScoreCompact]}>
        <View style={styles.highScoreCopy}>
          <Text style={styles.highScoreLabel} numberOfLines={1}>Best Session</Text>
          <Text style={styles.highScoreHint} numberOfLines={1}>Most true pints logged in one session</Text>
        </View>
        <Text
          style={styles.highScoreValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {stats.maxSessionPints}
        </Text>
      </Surface>

      <Surface style={[styles.highScoreContainer, styles.highScoreCompact, styles.streakContainer]}>
        <View style={styles.highScoreCopy}>
          <Text style={styles.highScoreLabel} numberOfLines={1}>Longest Streak</Text>
          <Text style={styles.highScoreHint} numberOfLines={1}>Most consecutive drinking days</Text>
        </View>
        <Text
          style={styles.highScoreValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {stats.longestDayStreak}
        </Text>
      </Surface>

      <View style={styles.section}>
        <SectionHeader
          title="Trophy Cabinet"
          subtitle="Completed trophies stay at the top."
          meta={`${earnedTrophies.length}/${trophies.length}`}
        />

        <View style={styles.badges}>
          {orderedTrophies.map((trophy) => (
            <View
              key={trophy.id}
              style={[
                styles.badge,
                trophy.earned ? styles.badgeEarned : styles.badgeLocked,
              ]}
            >
              <View style={[
                styles.badgeIcon,
                trophy.earned ? styles.badgeIconEarned : styles.badgeIconLocked,
              ]}>
                {renderTrophyIcon(trophy.kind, trophy.earned)}
              </View>
              <Text style={[
                styles.badgeText,
                trophy.earned ? styles.badgeTextEarned : styles.badgeTextLocked,
              ]}>
                {trophy.title}
              </Text>
              <Text style={styles.badgeDescription}>{trophy.description}</Text>
            </View>
          ))}
        </View>
      </View>

      <Modal
        visible={pintsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPintsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>True Pints</Text>
                <Text style={styles.modalSubtitle}>{stats.totalPints} logged all time</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPintsModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close true pints details"
              >
                <X color={colors.text} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={styles.explainerText}>
              A true pint is Beerva's normalized serving size: 568 ml. A 27.5cl RTD counts as 0.5 true pints, a 50cl drink counts as 0.9, and a Jägerbomb counts only its 2cl shot.
            </Text>

            <View style={styles.graphCard}>
              <View style={styles.graphHeader}>
                <Text style={styles.graphTitle}>Pints by month</Text>
                <Text style={styles.graphMeta}>Last 12 active months</Text>
              </View>
              {pintTimeline.length > 0 ? (
                <View style={styles.graphBars}>
                  {pintTimeline.map((point) => {
                    const height = maxTimelinePints > 0
                      ? Math.max(8, Math.round((point.pints / maxTimelinePints) * 96))
                      : 8;

                    return (
                      <View key={point.key} style={styles.graphBarColumn}>
                        <Text style={styles.graphValue} numberOfLines={1}>{point.pints}</Text>
                        <View style={styles.graphBarTrack}>
                          <View style={[styles.graphBarFill, { height }]} />
                        </View>
                        <Text style={styles.graphLabel} numberOfLines={1}>{point.label}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.graphEmpty}>
                  <Beer color={colors.textMuted} size={24} />
                  <Text style={styles.graphEmptyText}>No pint timeline yet.</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    paddingHorizontal: Platform.OS === 'web' ? 12 : 14,
    paddingVertical: Platform.OS === 'web' ? 10 : 11,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: 4,
  },
  divider: {
    width: 1,
    backgroundColor: colors.borderSoft,
  },
  statValue: {
    ...typography.h3,
    color: colors.primary,
    fontFamily: 'Righteous_400Regular',
    lineHeight: 26,
    maxWidth: '100%',
  },
  statLabel: {
    ...typography.caption,
    marginTop: 1,
    textAlign: 'center',
    maxWidth: '100%',
  },
  highScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
  },
  highScoreCompact: {
    paddingHorizontal: Platform.OS === 'web' ? 14 : 16,
    paddingVertical: Platform.OS === 'web' ? 11 : 12,
    minHeight: 72,
  },
  streakContainer: {
    marginTop: 8,
  },
  highScoreCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  highScoreLabel: {
    ...typography.h3,
    color: colors.text,
  },
  highScoreHint: {
    ...typography.caption,
    marginTop: 1,
  },
  highScoreValue: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 28,
    lineHeight: 34,
    color: colors.primary,
    minWidth: 56,
    maxWidth: 96,
    textAlign: 'right',
  },
  section: {
    padding: Platform.OS === 'web' ? 16 : 20,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    ...typography.h3,
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badge: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 104,
    minHeight: Platform.OS === 'web' ? 146 : 154,
    padding: 12,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  badgeEarned: {
    backgroundColor: colors.card,
    borderColor: colors.primaryBorder,
  },
  badgeLocked: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.borderSoft,
  },
  badgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  badgeIconEarned: {
    backgroundColor: colors.primarySoft,
  },
  badgeIconLocked: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  badgeText: {
    ...typography.caption,
    textAlign: 'center',
    fontWeight: '700',
    minHeight: 34,
  },
  badgeTextEarned: {
    color: colors.text,
  },
  badgeTextLocked: {
    color: colors.textMuted,
  },
  badgeDescription: {
    ...typography.caption,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
    padding: 16,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '86%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    padding: 16,
    gap: spacing.md,
    ...shadows.raised,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.h3,
    fontSize: 20,
  },
  modalSubtitle: {
    ...typography.caption,
    marginTop: 3,
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  explainerText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  graphCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 14,
    gap: spacing.md,
  },
  graphHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  graphTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '900',
  },
  graphMeta: {
    ...typography.caption,
    textAlign: 'right',
  },
  graphBars: {
    height: 154,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  graphBarColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  graphValue: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  graphBarTrack: {
    width: '100%',
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.cardMuted,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  graphBarFill: {
    width: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  graphLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  graphEmpty: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  graphEmptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
});
