import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type SectionHeaderProps = {
  title: string;
  meta?: string | number;
  subtitle?: string;
};

export const SectionHeader = ({ title, meta, subtitle }: SectionHeaderProps) => (
  <View style={styles.container}>
    <View style={styles.textBlock}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {meta !== undefined ? <Text style={styles.meta}>{meta}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    ...typography.h3,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  meta: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
