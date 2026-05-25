import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors } from '../theme/colors';

type BubbleStreamConfig = {
  id: string;
  left: `${number}%`;
  size: number;
  distance: number;
  opacity: number;
  drift: number;
  duration: number;
  delay: number;
  startY: number;
};

const BUBBLE_STREAMS = [
  { id: 'b1', left: '6%', size: 5, distance: 340, opacity: 0.52, drift: 8, duration: 3400, delay: 0, startY: 96 },
  { id: 'b2', left: '12%', size: 9, distance: 430, opacity: 0.44, drift: 13, duration: 4200, delay: 680, startY: 126 },
  { id: 'b3', left: '19%', size: 4, distance: 390, opacity: 0.5, drift: 9, duration: 3000, delay: 1180, startY: 108 },
  { id: 'b4', left: '27%', size: 12, distance: 365, opacity: 0.46, drift: 7, duration: 4600, delay: 220, startY: 146 },
  { id: 'b5', left: '36%', size: 5, distance: 460, opacity: 0.56, drift: 12, duration: 3600, delay: 1440, startY: 116 },
  { id: 'b6', left: '45%', size: 7, distance: 320, opacity: 0.48, drift: 8, duration: 2900, delay: 860, startY: 100 },
  { id: 'b7', left: '54%', size: 4, distance: 440, opacity: 0.42, drift: 13, duration: 3900, delay: 1720, startY: 138 },
  { id: 'b8', left: '63%', size: 10, distance: 350, opacity: 0.5, drift: 9, duration: 4800, delay: 420, startY: 122 },
  { id: 'b9', left: '72%', size: 5, distance: 410, opacity: 0.54, drift: 11, duration: 3150, delay: 1360, startY: 106 },
  { id: 'b10', left: '81%', size: 8, distance: 380, opacity: 0.46, drift: 10, duration: 4400, delay: 1020, startY: 132 },
  { id: 'b11', left: '89%', size: 4, distance: 455, opacity: 0.5, drift: 6, duration: 3500, delay: 1880, startY: 118 },
  { id: 'b12', left: '96%', size: 6, distance: 335, opacity: 0.38, drift: 7, duration: 4100, delay: 540, startY: 112 },
] satisfies BubbleStreamConfig[];

type FakeBeerVisualProps = {
  fillLevel: number;
  tiltDegrees: number;
  sloshOffset?: number;
  showHint?: boolean;
  style?: StyleProp<ViewStyle>;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

const CarbonationBubble = React.memo(({ stream }: { stream: BubbleStreamConfig }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(stream.delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: stream.duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [progress, stream.delay, stream.duration]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [stream.startY, -stream.distance],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 0.34, 0.68, 1],
    outputRange: [-stream.drift, stream.drift * 0.55, -stream.drift * 0.35, stream.drift],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.72, 1],
    outputRange: [0, stream.opacity, stream.opacity * 0.86, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.48, 1],
    outputRange: [0.62, 1.18, 0.82],
  });

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: stream.left,
          width: stream.size,
          height: stream.size,
          borderRadius: stream.size / 2,
          opacity,
          transform: [{ translateY }, { translateX }, { scale }],
        },
      ]}
    >
      <View style={styles.bubbleGlint} />
    </Animated.View>
  );
});

export const FakeBeerVisual = ({
  fillLevel,
  tiltDegrees,
  sloshOffset = 0,
  showHint = false,
  style,
}: FakeBeerVisualProps) => {
  const waveProgress = useRef(new Animated.Value(0)).current;
  const microWaveProgress = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(showHint ? 1 : 0)).current;
  const safeFillLevel = clamp01(fillLevel);
  const fillPercent = safeFillLevel * 100;
  const surfaceTop = clamp(100 - fillPercent - 3.5, -8, 101);
  const foamTop = clamp(surfaceTop - 2.5, -10, 98);
  const foamVisible = safeFillLevel > 0.035;
  const boundedTilt = clamp(tiltDegrees, -24, 24);
  const boundedSlosh = clamp(sloshOffset, -18, 18);
  const surfaceTilt = boundedTilt * 0.36;
  const sloshCurve = boundedSlosh * 0.16;
  const surfaceLeftY = clamp(100 - fillPercent - surfaceTilt, -10, 106);
  const surfaceMidY = clamp(100 - fillPercent + sloshCurve, -10, 106);
  const surfaceRightY = clamp(100 - fillPercent + surfaceTilt, -10, 106);

  const beerBodyPath = useMemo(() => (
    [
      `M -5 ${surfaceLeftY}`,
      `C 14 ${surfaceLeftY - 2 + sloshCurve} 32 ${surfaceMidY + 5} 50 ${surfaceMidY}`,
      `C 68 ${surfaceMidY - 5} 86 ${surfaceRightY + 2 - sloshCurve} 105 ${surfaceRightY}`,
      'L 105 106',
      'L -5 106',
      'Z',
    ].join(' ')
  ), [sloshCurve, surfaceLeftY, surfaceMidY, surfaceRightY]);

  const liquidSurfacePath = useMemo(() => (
    [
      `M -5 ${surfaceLeftY - 1.8}`,
      `C 15 ${surfaceLeftY - 4 + sloshCurve} 34 ${surfaceMidY - 1} 50 ${surfaceMidY - 1.6}`,
      `C 66 ${surfaceMidY - 2.2} 85 ${surfaceRightY - 4 - sloshCurve} 105 ${surfaceRightY - 1.8}`,
      `L 105 ${surfaceRightY + 4.2}`,
      `C 84 ${surfaceRightY + 1.2 - sloshCurve} 66 ${surfaceMidY + 4.8} 50 ${surfaceMidY + 4.6}`,
      `C 32 ${surfaceMidY + 4.4} 15 ${surfaceLeftY + 1.2 + sloshCurve} -5 ${surfaceLeftY + 4.2}`,
      'Z',
    ].join(' ')
  ), [sloshCurve, surfaceLeftY, surfaceMidY, surfaceRightY]);

  const foamPath = useMemo(() => (
    [
      `M -6 ${surfaceLeftY - 5}`,
      `C 4 ${surfaceLeftY - 12} 11 ${surfaceLeftY + 2} 20 ${surfaceLeftY - 5}`,
      `C 30 ${surfaceMidY - 13} 34 ${surfaceMidY + 2} 43 ${surfaceMidY - 5}`,
      `C 53 ${surfaceMidY - 14} 60 ${surfaceMidY + 2} 70 ${surfaceMidY - 6}`,
      `C 82 ${surfaceRightY - 15} 89 ${surfaceRightY + 2} 106 ${surfaceRightY - 6}`,
      `L 106 ${surfaceRightY + 8}`,
      `C 82 ${surfaceRightY + 4} 66 ${surfaceMidY + 8} 50 ${surfaceMidY + 7}`,
      `C 30 ${surfaceMidY + 6} 13 ${surfaceLeftY + 5} -6 ${surfaceLeftY + 8}`,
      'Z',
    ].join(' ')
  ), [surfaceLeftY, surfaceMidY, surfaceRightY]);

  useEffect(() => {
    waveProgress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(waveProgress, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [waveProgress]);

  useEffect(() => {
    microWaveProgress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(microWaveProgress, {
        toValue: 1,
        duration: 1650,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [microWaveProgress]);

  useEffect(() => {
    Animated.timing(hintOpacity, {
      toValue: showHint ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hintOpacity, showHint]);

  const waveTranslateX = waveProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-34, 34, -34],
  });
  const foamSheenTranslateX = waveProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [42, -42, 42],
  });
  const rippleBackTranslateX = waveProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-58, 58],
  });
  const rippleFrontTranslateX = microWaveProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [52, -52],
  });
  const surfaceTransform = [
    { translateY: boundedSlosh * 0.34 },
    { rotate: `${boundedTilt}deg` },
  ];

  return (
    <View style={[styles.container, style]}>
      <View pointerEvents="none" style={styles.chilledGlassTint} />

      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="beerBody" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFE08A" stopOpacity="0.96" />
            <Stop offset="0.38" stopColor="#F3A317" stopOpacity="1" />
            <Stop offset="0.72" stopColor="#B95C04" stopOpacity="1" />
            <Stop offset="1" stopColor="#743203" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="surfaceGlow" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFF9DA" stopOpacity="0.44" />
            <Stop offset="0.52" stopColor="#FFE16E" stopOpacity="0.7" />
            <Stop offset="1" stopColor="#FFEFC0" stopOpacity="0.36" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="rgba(242, 198, 96, 0.18)" />
        <Path d={beerBodyPath} fill="url(#beerBody)" />
        <Path d={liquidSurfacePath} fill="url(#surfaceGlow)" opacity={foamVisible ? 1 : 0} />
        <Path d={foamPath} fill="#FFF6DC" opacity={foamVisible ? 0.95 : 0} />
        <Circle cx="13" cy={surfaceLeftY + 0.5} r="4.5" fill="#FFFDF2" opacity={foamVisible ? 0.68 : 0} />
        <Circle cx="32" cy={surfaceMidY + 1.2} r="3.2" fill="#F4E6C2" opacity={foamVisible ? 0.54 : 0} />
        <Circle cx="58" cy={surfaceMidY - 0.8} r="4.8" fill="#FFFDF2" opacity={foamVisible ? 0.7 : 0} />
        <Circle cx="86" cy={surfaceRightY + 1} r="3.8" fill="#F7EBC8" opacity={foamVisible ? 0.58 : 0} />
      </Svg>

      <View pointerEvents="none" style={[styles.bubbleClip, { height: `${fillPercent}%` }]}>
        <View style={styles.deepAmberLayer} />
        <View style={styles.goldenCoreLayer} />
        <View style={styles.carbonationHaze} />
        {BUBBLE_STREAMS.map((stream) => (
          <CarbonationBubble key={stream.id} stream={stream} />
        ))}
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.liquidSurface,
          {
            top: `${surfaceTop}%`,
            opacity: foamVisible ? 1 : 0,
            transform: [{ translateX: waveTranslateX }, ...surfaceTransform],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.surfaceRippleBack,
            { transform: [{ translateX: rippleBackTranslateX }] },
          ]}
        />
        <View style={styles.liquidSurfaceGlow} />
        <Animated.View
          style={[
            styles.surfaceRippleFront,
            { transform: [{ translateX: rippleFrontTranslateX }] },
          ]}
        />
        <View style={styles.liquidSurfaceShadow} />
      </Animated.View>

      <View
        pointerEvents="none"
        style={[
          styles.foamSurface,
          {
            top: `${foamTop}%`,
            opacity: foamVisible ? 1 : 0,
            transform: surfaceTransform,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.foamSheen,
            { transform: [{ translateX: foamSheenTranslateX }] },
          ]}
        />
        <View style={[styles.foamPuff, styles.foamPuffLeft]} />
        <View style={[styles.foamPuff, styles.foamPuffCenter]} />
        <View style={[styles.foamPuff, styles.foamPuffRight]} />
        <View style={[styles.foamPock, styles.foamPockOne]} />
        <View style={[styles.foamPock, styles.foamPockTwo]} />
        <View style={[styles.foamPock, styles.foamPockThree]} />
      </View>

      <View pointerEvents="none" style={styles.leftGlassHighlight} />
      <View pointerEvents="none" style={styles.rightGlassHighlight} />
      <View pointerEvents="none" style={styles.topGlassRim} />
      <View pointerEvents="none" style={styles.bottomGlassWeight} />
      <View pointerEvents="none" style={styles.condensationOne} />
      <View pointerEvents="none" style={styles.condensationTwo} />
      <View pointerEvents="none" style={styles.condensationThree} />

      <Animated.View pointerEvents="none" style={[styles.hint, { opacity: hintOpacity }]}>
        <Text style={styles.hintText}>Tilt to drink</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#F0BF58',
  },
  chilledGlassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(219, 242, 255, 0.1)',
  },
  bubbleClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  deepAmberLayer: {
    position: 'absolute',
    left: -46,
    right: -46,
    bottom: -54,
    height: '78%',
    borderTopLeftRadius: 260,
    borderTopRightRadius: 260,
    backgroundColor: 'rgba(93, 36, 0, 0.34)',
  },
  goldenCoreLayer: {
    position: 'absolute',
    left: '18%',
    right: '19%',
    top: '8%',
    bottom: '12%',
    borderRadius: 180,
    backgroundColor: 'rgba(255, 208, 75, 0.22)',
  },
  carbonationHaze: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    top: 0,
    height: 110,
    borderBottomLeftRadius: 90,
    borderBottomRightRadius: 90,
    backgroundColor: 'rgba(255, 241, 176, 0.16)',
  },
  bubble: {
    position: 'absolute',
    bottom: -24,
    backgroundColor: 'rgba(255, 248, 208, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.78)',
    boxShadow: '0 0 8px rgba(255, 251, 218, 0.28)',
  },
  bubbleGlint: {
    position: 'absolute',
    top: '18%',
    left: '22%',
    width: '32%',
    height: '32%',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
  },
  liquidSurface: {
    position: 'absolute',
    left: -110,
    right: -110,
    height: 78,
    borderRadius: 999,
    overflow: 'hidden',
  },
  surfaceRippleBack: {
    position: 'absolute',
    left: -42,
    right: -42,
    top: 16,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 245, 184, 0.28)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 238, 0.3)',
  },
  liquidSurfaceGlow: {
    flex: 1,
    backgroundColor: 'rgba(255, 224, 112, 0.42)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 222, 0.62)',
  },
  surfaceRippleFront: {
    position: 'absolute',
    left: -64,
    right: -64,
    top: 4,
    height: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 219, 0.34)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.42)',
  },
  liquidSurfaceShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 30,
    backgroundColor: 'rgba(111, 50, 0, 0.22)',
  },
  foamSurface: {
    position: 'absolute',
    left: -34,
    right: -34,
    height: 84,
    borderRadius: 42,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 248, 224, 0.9)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(216, 137, 15, 0.2)',
  },
  foamSheen: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -40,
    width: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    transform: [{ skewX: '-16deg' }],
  },
  foamPuff: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 247, 0.96)',
    borderColor: 'rgba(238, 211, 163, 0.34)',
    borderWidth: 1,
  },
  foamPuffLeft: {
    width: 124,
    height: 58,
    borderRadius: 34,
    left: 22,
    top: -18,
  },
  foamPuffCenter: {
    width: 182,
    height: 68,
    borderRadius: 42,
    left: '34%',
    top: -30,
  },
  foamPuffRight: {
    width: 126,
    height: 54,
    borderRadius: 34,
    right: 24,
    top: -16,
  },
  foamPock: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(199, 127, 18, 0.12)',
  },
  foamPockOne: {
    width: 26,
    height: 12,
    left: '19%',
    top: 26,
  },
  foamPockTwo: {
    width: 18,
    height: 9,
    left: '54%',
    top: 18,
  },
  foamPockThree: {
    width: 22,
    height: 10,
    right: '14%',
    top: 36,
  },
  leftGlassHighlight: {
    position: 'absolute',
    top: 28,
    bottom: 36,
    left: 18,
    width: 24,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.19)',
  },
  rightGlassHighlight: {
    position: 'absolute',
    top: 96,
    bottom: 74,
    right: 24,
    width: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
  },
  topGlassRim: {
    position: 'absolute',
    top: 10,
    left: 18,
    right: 18,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.26)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  bottomGlassWeight: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 12,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(72, 31, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  condensationOne: {
    position: 'absolute',
    top: '18%',
    right: '18%',
    width: 4,
    height: 46,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.19)',
  },
  condensationTwo: {
    position: 'absolute',
    top: '48%',
    left: '15%',
    width: 5,
    height: 62,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  condensationThree: {
    position: 'absolute',
    top: '36%',
    right: '10%',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 54,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(13, 18, 26, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  hintText: {
    color: colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
});
