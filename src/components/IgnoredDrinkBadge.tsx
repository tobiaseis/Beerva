import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';

import { showAlert } from '../lib/dialogs';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';

type IgnoredDrinkBadgeProps = {
  excludedFromStats?: boolean | null;
  style?: StyleProp<ViewStyle>;
};

const DETECTIVE_EMOJI = '\u{1F575}\uFE0F';

const showSuspiciousDrinkInfo = () => {
  showAlert(
    'Suspicious drink',
    'This drink is marked as suspicious activity. It will not count towards stats, leaderboards, or trophies unless it is changed to the real amount.'
  );
};

export const IgnoredDrinkBadge = ({ excludedFromStats, style }: IgnoredDrinkBadgeProps) => {
  if (!excludedFromStats) return null;

  return (
    <TouchableOpacity
      accessibilityLabel="Suspicious drink"
      accessibilityHint="Shows why this drink is not counted in stats"
      accessibilityRole="button"
      activeOpacity={0.72}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      onPress={showSuspiciousDrinkInfo}
      style={[styles.badge, style]}
    >
      <Text style={styles.badgeText}>{DETECTIVE_EMOJI}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
