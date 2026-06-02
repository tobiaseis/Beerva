import React, { useState } from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import Svg, { Image as SvgImage, Text as SvgText } from 'react-native-svg';

import { spacing } from '../theme/layout';

const bottleImage = require('../../assets/chug-bottle-button.png');

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 360;
const TEXT_CENTER_X = 580;
const TEXT_CENTER_Y = 185;
const TEXT_MAX_WIDTH = 820;
const LABEL = 'HOW FAST CAN YOU CHUG?  >';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface Props {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ChugBottleButton({ onPress, disabled, style }: Props) {
  const [width, setWidth] = useState(0);
  const height = width > 0 ? Math.round((width * VIEW_HEIGHT) / VIEW_WIDTH) : 0;
  const renderedFontSize = clamp(width * 0.044, 13, 18);
  const renderedLetterSpacing = clamp(width * 0.004, 0.6, 1.5);
  const viewBoxScale = width > 0 ? VIEW_WIDTH / width : 1;
  const svgFontSize = renderedFontSize * viewBoxScale;
  const svgLetterSpacing = renderedLetterSpacing * viewBoxScale;

  return (
    <TouchableOpacity
      style={[styles.wrapper, style, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.76}
      accessibilityRole="button"
      accessibilityLabel="Record a 33cl bottle chug attempt"
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {width > 0 ? (
        <Svg width={width} height={height} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
          <SvgImage
            href={bottleImage}
            x={0}
            y={0}
            width={VIEW_WIDTH}
            height={VIEW_HEIGHT}
            preserveAspectRatio="xMidYMid meet"
          />
          <SvgText
            x={TEXT_CENTER_X + 3}
            y={TEXT_CENTER_Y + 3}
            fill="rgba(0, 0, 0, 0.8)"
            fontFamily="system-ui, -apple-system, Helvetica Neue, sans-serif"
            fontWeight="900"
            fontSize={svgFontSize}
            letterSpacing={svgLetterSpacing}
            textAnchor="middle"
            alignmentBaseline="middle"
            textLength={TEXT_MAX_WIDTH}
            lengthAdjust="spacingAndGlyphs"
          >
            {LABEL}
          </SvgText>
          <SvgText
            x={TEXT_CENTER_X}
            y={TEXT_CENTER_Y}
            fill="#FDE68A"
            fontFamily="system-ui, -apple-system, Helvetica Neue, sans-serif"
            fontWeight="900"
            fontSize={svgFontSize}
            letterSpacing={svgLetterSpacing}
            textAnchor="middle"
            alignmentBaseline="middle"
            textLength={TEXT_MAX_WIDTH}
            lengthAdjust="spacingAndGlyphs"
          >
            {LABEL}
          </SvgText>
        </Svg>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: spacing.md,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 15,
    elevation: 7,
  },
  disabled: {
    opacity: 0.68,
  },
});
