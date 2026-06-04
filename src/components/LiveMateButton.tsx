import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Radio } from 'lucide-react-native';

import { colors } from '../theme/colors';
import { radius } from '../theme/layout';

type LiveMateButtonProps = {
  count: number;
  onPress: () => void;
};

export const LiveMateButton = ({ count, onPress }: LiveMateButtonProps) => {
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    animationRef.current?.stop();
    progress.setValue(0);

    if (reduceMotion) return undefined;

    animationRef.current = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1900,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    animationRef.current.start();

    return () => {
      animationRef.current?.stop();
    };
  }, [progress, reduceMotion]);

  const outerScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1.78],
  });
  const outerOpacity = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.38, 0],
  });
  const innerScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.38],
  });
  const innerOpacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.22, 0.34, 0],
  });

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`Open live mates, ${count} drinking now`}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          styles.outerRing,
          reduceMotion ? styles.motionOffRing : { opacity: outerOpacity, transform: [{ scale: outerScale }] },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          styles.innerRing,
          reduceMotion ? styles.motionOffRing : { opacity: innerOpacity, transform: [{ scale: innerScale }] },
        ]}
      />
      <View style={styles.coreCircle}>
        <Radio color={colors.background} size={15} strokeWidth={3} />
      </View>
      {count > 1 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  pulseRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.danger,
  },
  outerRing: {
    backgroundColor: 'rgba(239, 68, 68, 0.42)',
  },
  innerRing: {
    backgroundColor: 'rgba(248, 113, 113, 0.36)',
  },
  motionOffRing: {
    opacity: 0.18,
  },
  coreCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: '#EF4444',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  countBadge: {
    position: 'absolute',
    top: 0,
    right: -1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  countText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '900',
  },
});
