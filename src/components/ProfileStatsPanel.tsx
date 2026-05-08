import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Award, Beer, CalendarDays, Flame, MapPin, Moon, PartyPopper, Repeat, Sparkles, Sunrise, Trophy } from 'lucide-react-native';

import { getTrophies, Stats, TrophyKind } from '../lib/profileStats';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type ProfileStatsPanelProps = {
  stats: Stats;
};

export const ProfileStatsPanel = ({ stats }: ProfileStatsPanelProps) => {
  const trophies = getTrophies(stats);
  const earnedTrophies = trophies.filter((trophy) => trophy.earned);

  const renderTrophyIcon = (kind: TrophyKind, earned: boolean) => {
    const iconColor = earned ? colors.primary : colors.textMuted;
    const iconSize = 28;

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
      case 'morning':
        return <Sunrise color={iconColor} size={iconSize} />;
      case 'calendar':
        return <CalendarDays color={iconColor} size={iconSize} />;
      default:
        return <Award color={iconColor} size={iconSize} />;
    }
  };

  return (
    <>
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.totalPints}</Text>
          <Text style={styles.statLabel}>True Pints</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.uniquePubs}</Text>
          <Text style={styles.statLabel}>Unique Pubs</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.avgAbv}%</Text>
          <Text style={styles.statLabel}>Avg ABV</Text>
        </View>
      </View>

      <View style={styles.highScoreContainer}>
        <View>
          <Text style={styles.highScoreLabel}>Best Session</Text>
          <Text style={styles.highScoreHint}>Most true pints logged in one session</Text>
        </View>
        <Text style={styles.highScoreValue}>{stats.maxSessionPints}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trophy Cabinet</Text>
          <Text style={styles.sectionMeta}>{earnedTrophies.length}/{trophies.length}</Text>
        </View>

        <View style={styles.badges}>
          {trophies.map((trophy) => (
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
    </>
  );
};

const styles = StyleSheet.create({
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: Platform.OS === 'web' ? 16 : 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 4,
    textAlign: 'center',
  },
  highScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: Platform.OS === 'web' ? 16 : 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  highScoreLabel: {
    ...typography.h3,
    color: colors.text,
    fontSize: 18,
  },
  highScoreHint: {
    ...typography.caption,
    marginTop: 4,
  },
  highScoreValue: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 36,
    color: colors.primary,
    marginLeft: 16,
  },
  section: {
    padding: Platform.OS === 'web' ? 16 : 20,
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
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  badgeEarned: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  badgeLocked: {
    backgroundColor: 'rgba(30, 41, 59, 0.45)',
    borderColor: 'rgba(148, 163, 184, 0.16)',
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
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
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
});
