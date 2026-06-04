import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { CachedImage } from './CachedImage';
import { getFlameTierConfig } from '../lib/streakFlame';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type StreakAvatarProps = {
  uri?: string | null;
  fallbackUri?: string;
  size: number;
  style?: StyleProp<any>;
  recyclingKey?: string;
  accessibilityLabel?: string;
  streak: number;
  showCount?: boolean;
};

// One flame tongue expressed in a 100x100 viewBox, pointing up from the bottom.
// Rendered multiple times rotated around the avatar center.
const TONGUE_PATH =
  'M50 8 C58 28 70 36 70 56 C70 74 60 86 50 86 C40 86 30 74 30 56 C30 36 42 28 50 8 Z';

const TONGUE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export const StreakAvatar = React.memo(({
  uri,
  fallbackUri,
  size,
  style,
  recyclingKey,
  accessibilityLabel,
  streak,
  showCount = false,
}: StreakAvatarProps) => {
  const tier = getFlameTierConfig(streak);
  const [reduceMotion, setReduceMotion] = useState(false);
  const flicker = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      // @ts-ignore — RN >= 0.65 returns an object with remove(); guard for older shapes.
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!tier || reduceMotion) {
      flicker.stopAnimation();
      flicker.setValue(0.5);
      return;
    }
    flicker.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, {
          toValue: 1,
          duration: tier.flickerDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
          // Driving react-native-svg element props (opacity/scaleY); native driver
          // does not support these — must be false.
          useNativeDriver: false,
        }),
        Animated.timing(flicker, {
          toValue: 0,
          duration: tier.flickerDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [tier, reduceMotion, flicker]);

  const avatar = (
    <CachedImage
      uri={uri}
      fallbackUri={fallbackUri}
      style={style}
      recyclingKey={recyclingKey}
      accessibilityLabel={accessibilityLabel}
    />
  );

  // No-op when there is no streak flame to show.
  if (!tier) {
    return avatar;
  }

  // Flame layer extends beyond the avatar by `inset` on every side.
  const inset = Math.round(size * 0.34 * tier.scale);
  const flameBox = size + inset * 2;
  const gradientId = `flame-${tier.tier}`;

  const tongues = useMemo(() => TONGUE_ANGLES.map((angle, index) => {
    const opacity = flicker.interpolate({
      inputRange: [0, 1],
      outputRange: index % 2 === 0 ? [0.55, 1] : [0.8, 0.5],
    });
    const scaleY = flicker.interpolate({
      inputRange: [0, 1],
      outputRange: index % 2 === 0 ? [0.86, 1.18] : [1.12, 0.9],
    });
    return { angle, opacity, scaleY, key: `t-${angle}` };
  }), [flicker]);

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={
        accessibilityLabel ? `${accessibilityLabel}, ${streak} day streak` : `${streak} day streak`
      }
    >
      <View
        pointerEvents="none"
        style={[
          styles.flameLayer,
          { width: flameBox, height: flameBox, top: -inset, left: -inset },
        ]}
      >
        <Svg width={flameBox} height={flameBox} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient
              id={gradientId}
              x1="50"
              y1="86"
              x2="50"
              y2="8"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={tier.colors.outer} stopOpacity="0.95" />
              <Stop offset="0.55" stopColor={tier.colors.mid} stopOpacity="0.95" />
              <Stop offset="1" stopColor={tier.colors.core} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          {tongues.map((t) => (
            <AnimatedPath
              key={t.key}
              d={TONGUE_PATH}
              fill={`url(#${gradientId})`}
              opacity={t.opacity}
              origin="50, 50"
              rotation={t.angle}
              scaleY={t.scaleY}
            />
          ))}
        </Svg>
      </View>

      {avatar}

      {showCount ? (
        <View pointerEvents="none" style={styles.countPill}>
          <Text style={styles.countText}>{`🔥 ${streak} day streak`}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  countPill: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    zIndex: 2,
  },
  countText: {
    ...typography.caption,
    color: colors.text,
    fontSize: 11,
  },
});
