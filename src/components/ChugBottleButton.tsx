import React from 'react';
import { DimensionValue, StyleSheet, Text, TouchableOpacity, View, StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { fontFamily } from '../theme/typography';
import { spacing } from '../theme/layout';

// SVG viewBox coordinate system
const VW = 320;
const VH = 68;
const RENDER_HEIGHT = 70;

// Bottle geometry (viewBox units)
const LR = 34;   // left-end arc radius
const BE = 220;  // body end x
const SE = 254;  // shoulder end x
const NE = 297;  // neck end / cap start x
const CE = 315;  // cap outer right edge x
const NT = 15;   // neck/cap top y
const NB = 53;   // neck/cap bottom y
const CR = 6;    // cap corner radius

// Full bottle silhouette path (clockwise)
const BOTTLE_PATH = [
  `M ${LR},2`,
  `L ${BE},2`,
  `L ${SE},${NT}`,
  `L ${NE},${NT}`,
  `L ${CE - CR},${NT} Q ${CE},${NT} ${CE},${NT + CR}`,
  `L ${CE},${NB - CR} Q ${CE},${NB} ${CE - CR},${NB}`,
  `L ${NE},${NB}`,
  `L ${SE},${NB}`,
  `L ${BE},${VH - 2}`,
  `L ${LR},${VH - 2}`,
  `A ${LR - 2},${LR - 2} 0 1 1 ${LR},2`,
  `Z`,
].join(' ');

// Cap-only path for separate gold fill
const CAP_PATH = [
  `M ${NE},${NT}`,
  `L ${CE - CR},${NT} Q ${CE},${NT} ${CE},${NT + CR}`,
  `L ${CE},${NB - CR} Q ${CE},${NB} ${CE - CR},${NB}`,
  `L ${NE},${NB}`,
  `Z`,
].join(' ');

// Body section as percentage of total viewBox width (for text centering)
// Body spans x: 0 → BE (220 out of 320), neck+cap takes the rest (~31%)
const NECK_CAP_PCT: DimensionValue = `${Math.round((1 - BE / VW) * 100)}%` as DimensionValue;

interface Props {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ChugBottleButton({ onPress, disabled, style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.wrapper, style, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.76}
      accessibilityRole="button"
      accessibilityLabel="Record a 33cl bottle chug attempt"
    >
      <Svg
        width="100%"
        height={RENDER_HEIGHT}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
      >
        <Defs>
          {/* Amber glass — vertical gradient simulating light through dark glass */}
          <LinearGradient id="cgGlass" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1C0800" />
            <Stop offset="20%" stopColor="#3B1205" />
            <Stop offset="48%" stopColor="#7A3010" />
            <Stop offset="75%" stopColor="#4E1A08" />
            <Stop offset="100%" stopColor="#1C0800" />
          </LinearGradient>
          {/* Left-edge warm glow (light bouncing off the rounded base) */}
          <LinearGradient id="cgShine" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="rgba(255,170,70,0.30)" />
            <Stop offset="26%" stopColor="rgba(255,170,70,0)" />
          </LinearGradient>
          {/* Gold bottle cap */}
          <LinearGradient id="cgCap" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#FDE68A" />
            <Stop offset="50%" stopColor="#F59E0B" />
            <Stop offset="100%" stopColor="#92400E" />
          </LinearGradient>
        </Defs>

        {/* Bottle glass body */}
        <Path d={BOTTLE_PATH} fill="url(#cgGlass)" stroke="#6B2A0C" strokeWidth="1.5" />

        {/* Warm reflection on left/base */}
        <Path d={BOTTLE_PATH} fill="url(#cgShine)" />

        {/* Top highlight streak */}
        <Rect
          x={LR + 14}
          y={5}
          width={BE - LR - 28}
          height={5}
          rx={2.5}
          fill="rgba(255,255,255,0.12)"
        />

        {/* Bottom amber inner-glow (beer colour showing through) */}
        <Rect
          x={LR + 8}
          y={VH - 14}
          width={BE - LR - 16}
          height={8}
          rx={3}
          fill="rgba(245,158,11,0.22)"
        />

        {/* Gold cap */}
        <Path d={CAP_PATH} fill="url(#cgCap)" stroke="#FDE68A" strokeWidth="0.75" />

        {/* Cap shine stripe */}
        <Rect
          x={NE + 4}
          y={NT + 4}
          width={5}
          height={NB - NT - 8}
          rx={2.5}
          fill="rgba(255,255,255,0.45)"
        />
      </Svg>

      {/* Text overlay — centered inside the bottle body section */}
      <View style={[styles.textOverlay, { right: NECK_CAP_PCT }]} pointerEvents="none">
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
          HOW FAST CAN YOU CHUG?{'  >'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: spacing.md,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  disabled: {
    opacity: 0.68,
  },
  textOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingLeft: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontFamily: fontFamily.bodyBold,
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
