import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarCheck } from 'lucide-react-native';
import { getWeeklyStreakBadgeCopy } from '../lib/weeklyStreaks';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';
import { typography } from '../theme/typography';

type Props = {
  weeks: number;
  activeThisWeek: boolean;
  isOwnProfile?: boolean;
};

export const WeeklyStreakBadge = ({ weeks, activeThisWeek, isOwnProfile = false }: Props) => {
  const copy = getWeeklyStreakBadgeCopy(weeks, activeThisWeek, isOwnProfile);
  if (!copy) return null;

  return (
    <View style={styles.container} accessibilityLabel={copy.hint ? `${copy.title}. ${copy.hint}` : copy.title}>
      <View style={styles.pill}>
        <CalendarCheck color={colors.primary} size={15} />
        <Text style={styles.title}>{copy.title}</Text>
      </View>
      {copy.hint ? <Text style={styles.hint}>{copy.hint}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  title: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
