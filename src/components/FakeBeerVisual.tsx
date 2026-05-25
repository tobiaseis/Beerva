import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors } from '../theme/colors';

type BubbleConfig = {
  id: string;
  left: `${number}%`;
  size: number;
  distance: number;
  opacity: number;
};

const BUBBLES = [
  { id: 'b1', left: '9%', size: 7, distance: 260, opacity: 0.62 },
  { id: 'b2', left: '18%', size: 4, distance: 330, opacity: 0.46 },
  { id: 'b3', left: '27%', size: 10, distance: 290, opacity: 0.5 },
  { id: 'b4', left: '42%', size: 5, distance: 360, opacity: 0.58 },
  { id: 'b5', left: '53%', size: 8, distance: 300, opacity: 0.44 },
  { id: 'b6', left: '68%', size: 4, distance: 345, opacity: 0.54 },
  { id: 'b7', left: '78%', size: 9, distance: 275, opacity: 0.48 },
  { id: 'b8', left: '91%', size: 6, distance: 325, opacity: 0.58 },
] satisfies BubbleConfig[];

type FakeBeerVisualProps = {
  fillLevel: number;
  tiltDegrees: number;
  showHint?: boolean;
  style?: ViewStyle;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const FakeBeerVisual = ({
  fillLevel,
  tiltDegrees,
  showHint = false,
  style,
}: FakeBeerVisualProps) => {
  const bubbleProgress = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(showHint ? 1 : 0)).current;
  const fillPercent = clamp01(fillLevel) * 100;
  const foamBottom = Math.max(0, fillPercent - 6);

  useEffect(() => {
    bubbleProgress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(bubbleProgress, {
        toValue: 1,
        duration: 2800,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [bubbleProgress]);

  useEffect(() => {
    Animated.timing(hintOpacity, {
      toValue: showHint ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [hintOpacity, showHint]);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.coldGlow} />
      <View style={[styles.liquidClip, { height: `${fillPercent}%` }]}>
        <View
          style={[
            styles.liquid,
            { transform: [{ rotate: `${tiltDegrees}deg` }, { scale: 1.12 }] },
          ]}
        />
        {BUBBLES.map((bubble, index) => {
          const translateY = bubbleProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [80 + index * 18, -bubble.distance],
          });
          const opacity = bubbleProgress.interpolate({
            inputRange: [0, 0.15, 0.82, 1],
            outputRange: [0, bubble.opacity, bubble.opacity * 0.8, 0],
          });

          return (
            <Animated.View
              key={bubble.id}
              style={[
                styles.bubble,
                {
                  left: bubble.left,
                  width: bubble.size,
                  height: bubble.size,
                  borderRadius: bubble.size / 2,
                  opacity,
                  transform: [{ translateY }],
                },
              ]}
            />
          );
        })}
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.foam,
          {
            bottom: `${foamBottom}%`,
            opacity: fillLevel > 0.02 ? 1 : 0,
          },
        ]}
      >
        <View style={[styles.foamPuff, styles.foamPuffLarge]} />
        <View style={[styles.foamPuff, styles.foamPuffMid]} />
        <View style={[styles.foamPuff, styles.foamPuffSmall]} />
      </View>

      <View pointerEvents="none" style={styles.leftGlassHighlight} />
      <View pointerEvents="none" style={styles.rightGlassHighlight} />
      <View pointerEvents="none" style={styles.condensationOne} />
      <View pointerEvents="none" style={styles.condensationTwo} />

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
    backgroundColor: '#F7B12E',
  },
  coldGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  liquidClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  liquid: {
    position: 'absolute',
    left: -80,
    right: -80,
    bottom: -90,
    height: '135%',
    backgroundColor: '#D98505',
    borderTopWidth: 3,
    borderTopColor: 'rgba(255, 246, 181, 0.54)',
  },
  bubble: {
    position: 'absolute',
    bottom: -18,
    backgroundColor: 'rgba(255, 248, 205, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
  },
  foam: {
    position: 'absolute',
    left: -18,
    right: -18,
    height: 74,
    backgroundColor: 'rgba(255, 247, 219, 0.94)',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
  },
  foamPuff: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 246, 0.96)',
  },
  foamPuffLarge: {
    width: 130,
    height: 58,
    borderRadius: 34,
    left: 18,
    top: -20,
  },
  foamPuffMid: {
    width: 170,
    height: 64,
    borderRadius: 38,
    left: '37%',
    top: -28,
  },
  foamPuffSmall: {
    width: 108,
    height: 48,
    borderRadius: 30,
    right: 20,
    top: -14,
  },
  leftGlassHighlight: {
    position: 'absolute',
    top: 28,
    bottom: 34,
    left: 18,
    width: 22,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  rightGlassHighlight: {
    position: 'absolute',
    top: 96,
    bottom: 70,
    right: 24,
    width: 9,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  condensationOne: {
    position: 'absolute',
    top: '22%',
    right: '18%',
    width: 4,
    height: 42,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  condensationTwo: {
    position: 'absolute',
    top: '52%',
    left: '16%',
    width: 5,
    height: 58,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 54,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(13, 18, 26, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  hintText: {
    color: colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
});
