import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { spacing } from '../theme/layout';

// ViewBox dimensions — aspect ratio drives the rendered height
const VW = 320;
const VH = 72;

// Bottle geometry (all in viewBox units)
//   Left end: semicircle, radius 36, center (36, 36)
//   Body:     x 0–222, full height
//   Shoulder: x 222–258, tapers from full height to neck height
//   Neck:     x 258–300, y 17–55
//   Cap:      x 300–318, y 17–55, rounded right corners (r=6)
const BODY_END = 222;
const NECK_TOP = 17;
const NECK_BOT = 55;
const NECK_START = 258;
const NECK_END = 300;
const CAP_END = 318;
const CAP_R = 6;

// Full bottle silhouette — traced clockwise
//   arc: from (36,70) through (2,36) back to (36,2)
//   sweep-flag=1 goes through the left side (confirmed via SVG θ-increase direction)
const BOTTLE = `M 36,2
  L ${BODY_END},2
  L ${NECK_START},${NECK_TOP}
  L ${NECK_END},${NECK_TOP}
  L ${CAP_END - CAP_R},${NECK_TOP} Q ${CAP_END},${NECK_TOP} ${CAP_END},${NECK_TOP + CAP_R}
  L ${CAP_END},${NECK_BOT - CAP_R} Q ${CAP_END},${NECK_BOT} ${CAP_END - CAP_R},${NECK_BOT}
  L ${NECK_END},${NECK_BOT}
  L ${NECK_START},${NECK_BOT}
  L ${BODY_END},${VH - 2}
  L 36,${VH - 2}
  A 34,34 0 0 1 36,2 Z`;

// Cap-only path for the separate gold gradient
const CAP = `M ${NECK_END},${NECK_TOP}
  L ${CAP_END - CAP_R},${NECK_TOP} Q ${CAP_END},${NECK_TOP} ${CAP_END},${NECK_TOP + CAP_R}
  L ${CAP_END},${NECK_BOT - CAP_R} Q ${CAP_END},${NECK_BOT} ${CAP_END - CAP_R},${NECK_BOT}
  L ${NECK_END},${NECK_BOT} Z`;

// Body centre for text — midpoint of the wide body section
const TEXT_CX = Math.round((36 + BODY_END) / 2);   // ≈ 129
const TEXT_CY = Math.round(VH / 2);                  // 36

// Build the SVG string once at module level (stable reference)
const BOTTLE_SVG = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Amber glass: dark at edges, warm amber in the middle like light through beer -->
    <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#190700"/>
      <stop offset="18%"  stop-color="#371104"/>
      <stop offset="50%"  stop-color="#7C3212"/>
      <stop offset="78%"  stop-color="#4A1807"/>
      <stop offset="100%" stop-color="#190700"/>
    </linearGradient>
    <!-- Warm left-edge glow: light bouncing off the rounded bottle base -->
    <linearGradient id="sh" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="rgba(255,165,60,0.32)"/>
      <stop offset="28%"  stop-color="rgba(255,165,60,0)"/>
    </linearGradient>
    <!-- Gold bottle cap -->
    <linearGradient id="cp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#FDE68A"/>
      <stop offset="48%"  stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#92400E"/>
    </linearGradient>
  </defs>

  <!-- Bottle silhouette filled with amber glass gradient -->
  <path d="${BOTTLE}" fill="url(#gl)" stroke="#6B2A0C" stroke-width="1.5"/>

  <!-- Warm glow overlay on left/base side -->
  <path d="${BOTTLE}" fill="url(#sh)"/>

  <!-- Glass surface highlight near top -->
  <rect x="52" y="5" width="152" height="5" rx="2.5" fill="rgba(255,255,255,0.11)"/>

  <!-- Inner amber beer-colour glow along bottom -->
  <rect x="46" y="${VH - 16}" width="162" height="9" rx="3.5" fill="rgba(245,158,11,0.20)"/>

  <!-- Gold cap -->
  <path d="${CAP}" fill="url(#cp)" stroke="#FDE68A" stroke-width="0.75"/>

  <!-- Cap shine stripe -->
  <rect x="${NECK_END + 4}" y="${NECK_TOP + 4}" width="5" height="${NECK_BOT - NECK_TOP - 8}" rx="2.5" fill="rgba(255,255,255,0.44)"/>

  <!-- Button label — text shadow rendered as a slightly-offset dark copy, then gold on top -->
  <text x="${TEXT_CX + 0.6}" y="${TEXT_CY + 0.8}"
    text-anchor="middle" dominant-baseline="middle"
    font-family="system-ui, -apple-system, Helvetica Neue, sans-serif"
    font-weight="900" font-size="12.5" letter-spacing="1.4"
    fill="rgba(0,0,0,0.82)">HOW FAST CAN YOU CHUG?  &gt;</text>
  <text x="${TEXT_CX}" y="${TEXT_CY}"
    text-anchor="middle" dominant-baseline="middle"
    font-family="system-ui, -apple-system, Helvetica Neue, sans-serif"
    font-weight="900" font-size="12.5" letter-spacing="1.4"
    fill="#FDE68A">HOW FAST CAN YOU CHUG?  &gt;</text>
</svg>`;

interface Props {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ChugBottleButton({ onPress, disabled, style }: Props) {
  const [width, setWidth] = useState(0);
  const height = width > 0 ? Math.round((width * VH) / VW) : 0;

  return (
    <TouchableOpacity
      style={[styles.wrapper, style, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.76}
      accessibilityRole="button"
      accessibilityLabel="Record a 33cl bottle chug attempt"
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {width > 0 && <SvgXml xml={BOTTLE_SVG} width={width} height={height} />}
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
});
