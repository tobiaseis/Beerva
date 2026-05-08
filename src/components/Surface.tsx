import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';

type SurfaceProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  raised?: boolean;
};

export const Surface = ({ children, style, padded = true, raised = false }: SurfaceProps) => (
  <View style={[
    styles.surface,
    padded ? styles.padded : null,
    raised ? styles.raised : null,
    style,
  ]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  padded: {
    padding: spacing.lg,
  },
  raised: {
    backgroundColor: colors.surfaceRaised,
    ...shadows.raised,
  },
});
