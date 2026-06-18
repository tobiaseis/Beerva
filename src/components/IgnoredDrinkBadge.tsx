import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';

import { colors } from '../theme/colors';
import { radius } from '../theme/layout';
import { typography } from '../theme/typography';

type IgnoredDrinkBadgeProps = {
  excludedFromStats?: boolean | null;
  style?: StyleProp<TextStyle>;
};

export const IgnoredDrinkBadge = ({ excludedFromStats, style }: IgnoredDrinkBadgeProps) => {
  if (!excludedFromStats) return null;

  return (
    <Text
      accessibilityLabel="Ignored in stats"
      style={[styles.badge, style]}
    >
      🕵️
    </Text>
  );
};

const styles = StyleSheet.create({
  badge: {
    ...typography.tiny,
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
});
