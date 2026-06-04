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
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

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

// --- Side-view flame geometry --------------------------------------------
// Everything is authored in a fixed 100x100 viewBox. The avatar is centered
// and (because `inset` is a constant fraction of `size`) always occupies a
// circle of radius ~30. Each flame "tongue" has its base tucked behind the
// avatar (radius 24, hidden) and licks UP-and-out so only its pointed tip
// shows past the avatar edge — fire seen from the side, wrapping the avatar's
// top and upper sides rather than radiating evenly like a top-down ring.
const CENTER = 50;
const BASE_RADIUS = 24;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const r1 = (n: number) => Math.round(n * 10) / 10;

const buildTongue = (
  angleDeg: number,
  length: number,
  halfWidth: number,
  lean: number,
  wiggle: number
): string => {
  const a = toRad(angleDeg);
  const ox = Math.sin(a); // 0deg points straight up, positive = clockwise
  const oy = -Math.cos(a);
  const baseX = CENTER + ox * BASE_RADIUS;
  const baseY = CENTER + oy * BASE_RADIUS;

  // Tip direction: blend the radial-outward vector toward straight-up so every
  // tongue rises, regardless of where it sits around the circle.
  let dx = ox * (1 - lean);
  let dy = oy * (1 - lean) + -1 * lean;
  const dlen = Math.hypot(dx, dy) || 1;
  dx /= dlen;
  dy /= dlen;

  const px = -dy; // perpendicular (for width)
  const py = dx;

  const tipX = baseX + dx * length + px * wiggle;
  const tipY = baseY + dy * length + py * wiggle;
  const blX = baseX - px * halfWidth;
  const blY = baseY - py * halfWidth;
  const brX = baseX + px * halfWidth;
  const brY = baseY + py * halfWidth;
  const clX = baseX - px * halfWidth * 0.85 + dx * length * 0.55;
  const clY = baseY - py * halfWidth * 0.85 + dy * length * 0.55;
  const crX = baseX + px * halfWidth * 0.85 + dx * length * 0.55;
  const crY = baseY + py * halfWidth * 0.85 + dy * length * 0.55;

  return (
    `M${r1(blX)} ${r1(blY)} ` +
    `Q${r1(clX)} ${r1(clY)} ${r1(tipX)} ${r1(tipY)} ` +
    `Q${r1(crX)} ${r1(crY)} ${r1(brX)} ${r1(brY)} ` +
    `Q${r1(baseX)} ${r1(baseY + halfWidth * 0.4)} ${r1(blX)} ${r1(blY)} Z`
  );
};

// Top hemisphere + sides only (skip the very bottom so no fire points down).
const TONGUE_SPECS = [
  { a: 0, len: 25, w: 8.5 },
  { a: -24, len: 23, w: 8 },
  { a: 24, len: 23, w: 8 },
  { a: -48, len: 20, w: 7.5 },
  { a: 48, len: 20, w: 7.5 },
  { a: -72, len: 18, w: 7 },
  { a: 72, len: 18, w: 7 },
  { a: -94, len: 16, w: 6.5 },
  { a: 94, len: 16, w: 6.5 },
];

const AVATAR_FLAME_PATHS: AvatarFlamePath[] = TONGUE_SPECS.map((spec, index) => {
  const lean = Math.min(0.82, 0.18 + Math.abs(spec.a) / 165);
  const wiggle = (index % 2 === 0 ? 1 : -1) * 2.2;
  const rising = index % 2 === 0;
  return {
    key: `tongue-${spec.a}`,
    d: buildTongue(spec.a, spec.len, spec.w, lean, wiggle),
    // Alternating ranges desync the flicker so neighbouring tongues never
    // pulse in unison off a single driver.
    opacity: rising ? [0.6, 0.98] : [0.85, 0.55],
    scaleY: rising ? [0.9, 1.16] : [1.12, 0.92],
  };
});

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
          // Driving react-native-svg element props (opacity/scaleY); the native
          // driver does not support these — must be false.
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

  const flames = useMemo(() => AVATAR_FLAME_PATHS.map((path) => ({
    ...path,
    animatedOpacity: flicker.interpolate({ inputRange: [0, 1], outputRange: path.opacity }),
    animatedScaleY: flicker.interpolate({ inputRange: [0, 1], outputRange: path.scaleY }),
  })), [flicker]);

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

  // Constant fraction keeps the avatar at ~radius 30 in the 100-unit viewBox,
  // so the authored tongue geometry lines up at every avatar size.
  const inset = Math.round(size * 0.34);
  const flameBox = size + inset * 2;
  const gradientId = `flame-grad-${tier.tier}`;
  const glowId = `flame-glow-${tier.tier}`;

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
              {/* Hot colour at the base (behind the avatar), cooler at the tips. */}
              <LinearGradient
                id={gradientId}
                x1="50"
                y1="80"
                x2="50"
                y2="6"
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={tier.colors.core} stopOpacity="1" />
                <Stop offset="0.5" stopColor={tier.colors.mid} stopOpacity="0.95" />
                <Stop offset="1" stopColor={tier.colors.outer} stopOpacity="0.92" />
              </LinearGradient>
              <RadialGradient id={glowId} cx="50" cy="54" r="48" gradientUnits="userSpaceOnUse">
                <Stop offset="0.5" stopColor={tier.colors.mid} stopOpacity="0" />
                <Stop offset="0.78" stopColor={tier.colors.mid} stopOpacity="0.32" />
                <Stop offset="1" stopColor={tier.colors.outer} stopOpacity="0" />
              </RadialGradient>
            </Defs>

            {/* Soft aura grounding the flame around the avatar. */}
            <Circle cx="50" cy="54" r="48" fill={`url(#${glowId})`} />

            {flames.map((flame) => (
              <AnimatedPath
                key={flame.key}
                d={flame.d}
                fill={`url(#${gradientId})`}
                opacity={flame.animatedOpacity}
                origin="50, 74"
                scaleY={flame.animatedScaleY}
              />
            ))}
          </Svg>
        </View>

        {avatar}
      </View>

      {showCount ? (
        <View pointerEvents="none" style={styles.countAnchor}>
          <View style={styles.countSide}>
            <Flame color={colors.primary} fill={colors.primary} size={12} strokeWidth={2.5} />
            <Text style={styles.countText}>{`${streak} day streak`}</Text>
          </View>
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
  // Absolute + centered so the streak label never shifts the avatar layout
  // (keeps the profile edit badge anchored to the avatar, not the label).
  countAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -14,
    alignItems: 'center',
    zIndex: 3,
  },
  countSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  countText: {
    ...typography.tiny,
    color: colors.text,
    fontSize: 12,
    lineHeight: 14,
  },
});
