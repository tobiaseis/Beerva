import React from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { colors } from '../theme/colors';

type EmptyIllustrationProps = {
  kind: 'feed' | 'notifications' | 'search' | 'trophy';
  size?: number;
};

const VIEW = 200;

const Halo = () => (
  <>
    <Defs>
      <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.22" />
        <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
      </RadialGradient>
    </Defs>
    <Circle cx={VIEW / 2} cy={VIEW / 2} r={VIEW / 2 - 6} fill="url(#halo)" />
  </>
);

const FeedScene = () => (
  <G>
    <Defs>
      <LinearGradient id="glassA" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.95" />
        <Stop offset="100%" stopColor={colors.primaryDark} stopOpacity="0.85" />
      </LinearGradient>
      <LinearGradient id="glassB" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#FFD27A" stopOpacity="0.95" />
        <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.85" />
      </LinearGradient>
    </Defs>
    {/* Left glass tilted right */}
    <G transform="translate(50 80) rotate(-14)">
      <Rect x="0" y="0" width="36" height="60" rx="6" fill={colors.surfaceRaised} stroke={colors.primaryBorder} strokeWidth="2" />
      <Rect x="3" y="14" width="30" height="44" rx="4" fill="url(#glassA)" />
      <Rect x="3" y="6" width="30" height="10" rx="2" fill="#FFFFFF" opacity="0.72" />
      <Rect x="36" y="18" width="6" height="22" rx="3" fill={colors.surfaceRaised} stroke={colors.primaryBorder} strokeWidth="2" />
    </G>
    {/* Right glass tilted left */}
    <G transform="translate(116 80) rotate(14)">
      <Rect x="0" y="0" width="36" height="60" rx="6" fill={colors.surfaceRaised} stroke={colors.primaryBorder} strokeWidth="2" />
      <Rect x="3" y="14" width="30" height="44" rx="4" fill="url(#glassB)" />
      <Rect x="3" y="6" width="30" height="10" rx="2" fill="#FFFFFF" opacity="0.72" />
      <Rect x="-6" y="18" width="6" height="22" rx="3" fill={colors.surfaceRaised} stroke={colors.primaryBorder} strokeWidth="2" />
    </G>
    {/* Sparkles */}
    <Circle cx="100" cy="48" r="3" fill={colors.primary} />
    <Circle cx="80" cy="38" r="2" fill={colors.primary} opacity="0.7" />
    <Circle cx="120" cy="42" r="2" fill={colors.primary} opacity="0.7" />
  </G>
);

const NotificationsScene = () => (
  <G>
    <Defs>
      <LinearGradient id="mug" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.9" />
        <Stop offset="100%" stopColor={colors.primaryDark} stopOpacity="0.85" />
      </LinearGradient>
    </Defs>
    {/* Mug body */}
    <Rect x="62" y="78" width="64" height="64" rx="8" fill={colors.surfaceRaised} stroke={colors.primaryBorder} strokeWidth="2" />
    <Rect x="66" y="92" width="56" height="46" rx="5" fill="url(#mug)" />
    {/* Foam */}
    <Path
      d="M62 88 q8 -10 16 0 q8 -10 16 0 q8 -10 16 0 q8 -10 16 0 v6 H62 z"
      fill="#FFFFFF"
      opacity="0.85"
    />
    {/* Handle */}
    <Path
      d="M126 96 q14 4 14 18 q0 14 -14 18"
      fill="none"
      stroke={colors.primaryBorder}
      strokeWidth="4"
      strokeLinecap="round"
    />
    {/* Sleepy z's */}
    <Path d="M132 56 h10 l-10 12 h10" stroke={colors.textMuted} strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    <Path d="M148 38 h7 l-7 8 h7" stroke={colors.textMuted} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
  </G>
);

const SearchScene = () => (
  <G>
    <Defs>
      <LinearGradient id="searchGlass" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.85" />
        <Stop offset="100%" stopColor={colors.primaryDark} stopOpacity="0.85" />
      </LinearGradient>
    </Defs>
    {/* Mini beer glass */}
    <G transform="translate(74 84)">
      <Rect x="0" y="0" width="40" height="48" rx="4" fill={colors.surfaceRaised} stroke={colors.primaryBorder} strokeWidth="2" />
      <Rect x="3" y="10" width="34" height="34" rx="2" fill="url(#searchGlass)" />
      <Rect x="3" y="4" width="34" height="8" rx="2" fill="#FFFFFF" opacity="0.7" />
    </G>
    {/* Magnifying glass over the beer */}
    <Circle cx="118" cy="92" r="30" fill="none" stroke={colors.text} strokeWidth="6" />
    <Circle cx="118" cy="92" r="30" fill={colors.primary} fillOpacity="0.08" />
    <Path d="M140 116 l22 22" stroke={colors.text} strokeWidth="8" strokeLinecap="round" />
  </G>
);

const TrophyScene = () => (
  <G>
    <Defs>
      <LinearGradient id="trophy" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.9" />
        <Stop offset="100%" stopColor={colors.primaryDark} stopOpacity="0.8" />
      </LinearGradient>
    </Defs>
    {/* Trophy cup */}
    <Path
      d="M70 60 h60 v18 a30 30 0 0 1 -60 0 z"
      fill="url(#trophy)"
      stroke={colors.primaryBorder}
      strokeWidth="2"
    />
    <Rect x="92" y="100" width="16" height="14" fill={colors.primaryDark} />
    <Rect x="80" y="114" width="40" height="8" rx="2" fill={colors.primaryBorder} />
    {/* Lock over trophy */}
    <Rect x="84" y="74" width="32" height="26" rx="4" fill={colors.surfaceRaised} stroke={colors.borderSoft} strokeWidth="2" />
    <Path d="M90 74 v-8 a10 10 0 0 1 20 0 v8" fill="none" stroke={colors.borderSoft} strokeWidth="3" />
    <Circle cx="100" cy="86" r="3" fill={colors.primary} />
    <Path d="M100 86 v6" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" />
  </G>
);

export const EmptyIllustration = ({ kind, size = 160 }: EmptyIllustrationProps) => {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <Halo />
      {kind === 'feed' ? <FeedScene /> : null}
      {kind === 'notifications' ? <NotificationsScene /> : null}
      {kind === 'search' ? <SearchScene /> : null}
      {kind === 'trophy' ? <TrophyScene /> : null}
    </Svg>
  );
};
