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
// Authored in a fixed 100x100 viewBox. Because `inset` is a constant fraction
// of `size`, the avatar always sits as a circle of radius ~30 at the center.
// Each flame "tongue" starts hidden behind the avatar (radius 22) and curls
// UP-and-out to a tip that hugs just past the avatar edge — so the avatar
// looks wrapped in fire seen from the side, with the licks taller over the top
// and shorter down the sides, rather than radiating evenly like a top-down ring.
const CENTER = 50;
const BASE_RADIUS = 22;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const r1 = (n: number) => Math.round(n * 10) / 10;

const buildTongue = (
  baseAngleDeg: number,
  tipRadius: number,
  curl: number,
  halfWidth: number,
  wiggle: number
): string => {
  const ba = toRad(baseAngleDeg); // 0deg = straight up, positive = clockwise
  const ox = Math.sin(ba);
  const oy = -Math.cos(ba);
  const baseX = CENTER + ox * BASE_RADIUS;
  const baseY = CENTER + oy * BASE_RADIUS;

  // Tip sits at a smaller angle (rotated toward the top) so every tongue leans
  // upward — the defining trait of a side-view flame.
  const ta = toRad(baseAngleDeg * (1 - curl));
  const trx = Math.sin(ta);
  const try_ = -Math.cos(ta);
  const tpx = -try_; // tangent at tip, for the flame-tip wiggle
  const tpy = trx;
  const tipX = CENTER + trx * tipRadius + tpx * wiggle;
  const tipY = CENTER + try_ * tipRadius + tpy * wiggle;

  let dx = tipX - baseX;
  let dy = tipY - baseY;
  const dlen = Math.hypot(dx, dy) || 1;
  dx /= dlen;
  dy /= dlen;
  const px = -dy; // perpendicular (width)
  const py = dx;

  const blX = baseX - px * halfWidth;
  const blY = baseY - py * halfWidth;
  const brX = baseX + px * halfWidth;
  const brY = baseY + py * halfWidth;
  const clX = baseX - px * halfWidth * 0.8 + dx * dlen * 0.5;
  const clY = baseY - py * halfWidth * 0.8 + dy * dlen * 0.5;
  const crX = baseX + px * halfWidth * 0.8 + dx * dlen * 0.5;
  const crY = baseY + py * halfWidth * 0.8 + dy * dlen * 0.5;

  return (
    `M${r1(blX)} ${r1(blY)} ` +
    `Q${r1(clX)} ${r1(clY)} ${r1(tipX)} ${r1(tipY)} ` +
    `Q${r1(crX)} ${r1(crY)} ${r1(brX)} ${r1(brY)} ` +
    `Q${r1(baseX)} ${r1(baseY + halfWidth * 0.4)} ${r1(blX)} ${r1(blY)} Z`
  );
};

// Wrap the top and both sides (skip the very bottom so no flame points down).
const FLAME_BASE_ANGLES = [0, -30, 30, -60, 60, -90, 90, -120, 120, -150, 150, -170, 170];

const AVATAR_FLAME_PATHS: AvatarFlamePath[] = FLAME_BASE_ANGLES.map((angle, index) => {
  const upFactor = (1 + Math.cos(toRad(angle))) / 2; // 1 at top, 0 at bottom
  const tipRadius = 34 + 12 * upFactor; // taller licks over the top
  const halfWidth = 5.4 + 2.6 * upFactor;
  const wiggle = (index % 2 === 0 ? 1 : -1) * 1.8;
  const rising = index % 2 === 0;
  return {
    key: `tongue-${angle}`,
    d: buildTongue(angle, tipRadius, 0.3, halfWidth, wiggle),
    // Alternating ranges desync the flicker off a single driver.
    opacity: rising ? [0.62, 0.98] : [0.86, 0.58],
    scaleY: rising ? [0.92, 1.14] : [1.12, 0.94],
  };
});

const MARGIN_KEYS = [
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
] as const;

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

  // Split the caller's layout margins onto the wrapper so they never offset the
  // avatar inside the frame (which would push the flame off-center).
  const flatStyle = (StyleSheet.flatten(style) || {}) as Record<string, unknown>;
  const wrapMargin: Record<string, unknown> = {};
  const imageStyle: Record<string, unknown> = {};
  Object.keys(flatStyle).forEach((key) => {
    if ((MARGIN_KEYS as readonly string[]).includes(key)) {
      wrapMargin[key] = flatStyle[key];
    } else {
      imageStyle[key] = flatStyle[key];
    }
  });

  const avatar = (
    <CachedImage
      uri={uri}
      fallbackUri={fallbackUri}
      style={tier ? imageStyle : style}
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

  const streakLabel = `${streak} day${streak === 1 ? '' : 's'}`;

  return (
    <View
      style={[styles.wrap, wrapMargin]}
      accessibilityLabel={
        accessibilityLabel ? `${accessibilityLabel}, ${streak} day streak` : `${streak} day streak`
      }
    >
      {/* Flame stage is the full flame box but uses a negative margin so it only
          occupies the avatar's footprint in layout — the flame paints outward
          around the avatar without depending on a smaller parent overflowing. */}
      <View style={[styles.flameStage, { width: flameBox, height: flameBox, margin: -inset }]}>
        <Svg
          pointerEvents="none"
          style={styles.flameSvg}
          width={flameBox}
          height={flameBox}
          viewBox="0 0 100 100"
        >
          <Defs>
            {/* Hot colour at the base (behind the avatar), cooler at the tips. */}
            <LinearGradient
              id={gradientId}
              x1="50"
              y1="78"
              x2="50"
              y2="8"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={tier.colors.core} stopOpacity="1" />
              <Stop offset="0.5" stopColor={tier.colors.mid} stopOpacity="0.95" />
              <Stop offset="1" stopColor={tier.colors.outer} stopOpacity="0.92" />
            </LinearGradient>
            <RadialGradient id={glowId} cx="50" cy="50" r="46" gradientUnits="userSpaceOnUse">
              <Stop offset="0.58" stopColor={tier.colors.mid} stopOpacity="0" />
              <Stop offset="0.82" stopColor={tier.colors.mid} stopOpacity="0.24" />
              <Stop offset="1" stopColor={tier.colors.outer} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Soft aura grounding the flame around the avatar. */}
          <Circle cx="50" cy="50" r="46" fill={`url(#${glowId})`} />

          {flames.map((flame) => (
            <AnimatedPath
              key={flame.key}
              d={flame.d}
              fill={`url(#${gradientId})`}
              opacity={flame.animatedOpacity}
              origin="50, 68"
              scaleY={flame.animatedScaleY}
            />
          ))}
        </Svg>

        {/* Avatar layered on top of the flame. */}
        <View style={[styles.avatarHolder, { width: size, height: size }]}>
          {avatar}

          {showCount ? (
            <View pointerEvents="none" style={styles.countSide}>
              <Flame color={colors.primary} fill={colors.primary} size={11} strokeWidth={2.5} />
              <Text style={styles.countText} numberOfLines={1}>{streakLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  flameStage: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  flameSvg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  avatarHolder: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  // Compact chip pinned to the avatar's lower-left — beside the avatar content,
  // single line, so it never wraps or runs off the screen edge.
  countSide: {
    position: 'absolute',
    bottom: 1,
    left: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    zIndex: 2,
  },
  countText: {
    ...typography.tiny,
    color: colors.text,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
});
