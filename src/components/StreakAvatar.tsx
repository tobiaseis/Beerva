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
import { Flame } from 'lucide-react-native';
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

type AvatarFlamePath = {
  key: string;
  d: string;
  opacity: [number, number];
  scaleY: [number, number];
};

const AVATAR_FLAME_PATHS: AvatarFlamePath[] = [
  {
    key: 'outer',
    d: 'M18 88 C8 76 12 61 25 49 C19 34 34 27 40 10 C48 28 61 25 63 43 C75 34 87 47 79 62 C91 70 91 84 78 91 C72 81 62 84 55 94 C49 82 38 84 31 92 C29 84 22 82 18 88 Z',
    opacity: [0.72, 0.98],
    scaleY: [0.94, 1.05],
  },
  {
    key: 'left',
    d: 'M23 90 C16 78 20 64 33 54 C29 42 38 34 43 22 C49 38 57 39 57 54 C67 62 66 80 55 92 C51 82 40 81 34 92 C31 84 26 84 23 90 Z',
    opacity: [0.55, 0.86],
    scaleY: [1.04, 0.93],
  },
  {
    key: 'right',
    d: 'M46 92 C39 81 44 68 55 58 C52 45 62 37 68 25 C72 41 82 43 78 58 C88 66 87 82 75 91 C70 82 61 83 56 94 C53 86 49 86 46 92 Z',
    opacity: [0.5, 0.82],
    scaleY: [0.96, 1.09],
  },
  {
    key: 'core',
    d: 'M37 90 C31 80 36 67 47 58 C44 48 51 41 53 31 C58 44 67 48 64 62 C72 69 70 82 60 91 C56 84 48 84 43 93 C41 86 39 85 37 90 Z',
    opacity: [0.62, 0.94],
    scaleY: [1.02, 0.96],
  },
];

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
  const inset = Math.round(size * 0.3 * tier.scale);
  const flameBox = size + inset * 2;
  const gradientId = `flame-${tier.tier}`;
  const countSide = {
    top: Math.round(size * 0.34),
    left: Math.round(size * 0.68),
  };

  const flames = useMemo(() => AVATAR_FLAME_PATHS.map((path) => {
    const opacity = flicker.interpolate({
      inputRange: [0, 1],
      outputRange: path.opacity,
    });
    const scaleY = flicker.interpolate({
      inputRange: [0, 1],
      outputRange: path.scaleY,
    });
    return { ...path, opacity, scaleY };
  }), [flicker]);

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={
        accessibilityLabel ? `${accessibilityLabel}, ${streak} day streak` : `${streak} day streak`
      }
    >
      <View style={[styles.avatarFrame, { width: size, height: size }]}>
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
                x1="44"
                y1="92"
                x2="58"
                y2="8"
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={tier.colors.outer} stopOpacity="0.94" />
                <Stop offset="0.48" stopColor={tier.colors.mid} stopOpacity="0.9" />
                <Stop offset="1" stopColor={tier.colors.core} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            {flames.map((flame) => (
              <AnimatedPath
                key={flame.key}
                d={flame.d}
                fill={`url(#${gradientId})`}
                opacity={flame.opacity}
                origin="50, 92"
                scaleY={flame.scaleY}
              />
            ))}
          </Svg>
        </View>

        {avatar}
      </View>

      {showCount ? (
        <View pointerEvents="none" style={[styles.countPill, countSide]}>
          <Flame color={colors.primary} fill={colors.primary} size={12} strokeWidth={2.5} />
          <Text style={styles.countText}>{`${streak} day streak`}</Text>
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
  avatarFrame: {
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    zIndex: 3,
  },
  countText: {
    ...typography.tiny,
    color: colors.text,
    fontSize: 12,
    lineHeight: 14,
  },
});
