import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors } from '../theme/colors';
import { radius } from '../theme/layout';

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export const Skeleton = ({ width = '100%', height = 16, borderRadius: br = radius.sm, style }: SkeletonProps) => {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.72, duration: 850, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.bone,
        { width: width as any, height, borderRadius: br, opacity },
        style,
      ]}
    />
  );
};

/* ─── Feed skeleton ─── */

export const SkeletonFeedCard = () => (
  <View style={styles.card}>
    {/* Header: avatar + text */}
    <View style={styles.cardHeader}>
      <Skeleton width={42} height={42} borderRadius={21} />
      <View style={styles.headerText}>
        <Skeleton width={110} height={14} />
        <Skeleton width={70} height={11} style={styles.mt6} />
      </View>
    </View>
    {/* Image placeholder */}
    <Skeleton width="100%" height={236} borderRadius={0} />
    {/* Content */}
    <View style={styles.cardContent}>
      <Skeleton width="75%" height={14} />
      <Skeleton width="60%" height={14} style={styles.mt8} />
    </View>
    {/* Footer */}
    <View style={styles.cardFooter}>
      <Skeleton width={100} height={28} borderRadius={14} />
    </View>
  </View>
);

/* ─── People skeleton ─── */

export const SkeletonPersonRow = () => (
  <View style={styles.personRow}>
    <Skeleton width={48} height={48} borderRadius={24} />
    <View style={styles.personText}>
      <Skeleton width={100} height={14} />
      <Skeleton width={60} height={11} style={styles.mt6} />
    </View>
    <Skeleton width={80} height={34} borderRadius={17} />
  </View>
);

/* ─── Profile skeleton ─── */

export const SkeletonProfile = () => (
  <View style={styles.profileContainer}>
    <Skeleton width={104} height={104} borderRadius={52} />
    <Skeleton width={140} height={22} style={styles.mt12} />
    <Skeleton width={90} height={14} style={styles.mt6} />
  </View>
);

const styles = StyleSheet.create({
  bone: {
    backgroundColor: colors.border,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    marginBottom: 18,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  cardContent: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  cardFooter: {
    padding: 18,
  },
  personRow: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  personText: {
    flex: 1,
  },
  profileContainer: {
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 22,
  },
  mt6: { marginTop: 6 },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
});
