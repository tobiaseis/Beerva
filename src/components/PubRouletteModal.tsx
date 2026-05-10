import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { CheckCircle2, MapPin, RefreshCw, Sparkles, X } from 'lucide-react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { AppButton } from './AppButton';
import { formatPubDetail, formatPubLabel } from '../lib/pubDirectory';
import type { PubRecord } from '../lib/pubDirectory';
import { getRouletteTargetRotation, pickRouletteWinner, ROULETTE_MAX_DISTANCE_METERS } from '../lib/pubRoulette';
import { hapticMedium, hapticSuccess } from '../lib/haptics';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { fontFamily, typography } from '../theme/typography';

type PubRouletteModalProps = {
  visible: boolean;
  pubs: PubRecord[];
  loading: boolean;
  refreshing?: boolean;
  error?: string | null;
  starting?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onUsePub: (pub: PubRecord) => void;
  onStartHere: (pub: PubRecord) => void;
};

const WHEEL_COLORS = ['#B91C1C', '#0F6B4F', '#111827', '#D58A08'];

const polarPoint = (center: number, radiusValue: number, angleFromTop: number) => {
  const angle = (angleFromTop - 90) * Math.PI / 180;
  return {
    x: center + radiusValue * Math.cos(angle),
    y: center + radiusValue * Math.sin(angle),
  };
};

const createSegmentPath = (index: number, itemCount: number, size: number) => {
  const center = size / 2;
  const radiusValue = center - 7;
  const segment = 360 / itemCount;
  const start = index * segment;
  const end = start + segment;
  const startPoint = polarPoint(center, radiusValue, start);
  const endPoint = polarPoint(center, radiusValue, end);
  const largeArc = segment > 180 ? 1 : 0;

  return [
    `M ${center} ${center}`,
    `L ${startPoint.x} ${startPoint.y}`,
    `A ${radiusValue} ${radiusValue} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}`,
    'Z',
  ].join(' ');
};

const shortenWheelLabel = (label: string) => {
  const cleanLabel = label.replace(/,\s*.*/, '').trim();
  if (cleanLabel.length <= 16) return cleanLabel;
  return `${cleanLabel.slice(0, 14).trim()}..`;
};

const getPubIdentity = (pub: PubRecord) => (
  pub.id || `${pub.source || 'pub'}:${pub.source_id || `${pub.name}:${pub.city || ''}`}`.toLowerCase()
);

const includesPub = (pubs: PubRecord[], pub: PubRecord) => {
  const identity = getPubIdentity(pub);
  return pubs.some((item) => getPubIdentity(item) === identity);
};

const RouletteWheel = ({ pubs, size }: { pubs: PubRecord[]; size: number }) => {
  const center = size / 2;
  const labelRadius = size * 0.31;
  const itemCount = Math.max(pubs.length, 1);
  const segment = 360 / itemCount;

  if (pubs.length === 1) {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={center} cy={center} r={center - 7} fill="#0F6B4F" stroke={colors.primary} strokeWidth={5} />
        <SvgText
          x={center}
          y={center - 16}
          fill={colors.text}
          fontSize={16}
          fontWeight="800"
          fontFamily={fontFamily.bodyBold}
          textAnchor="middle"
        >
          The Wheel
        </SvgText>
        <SvgText
          x={center}
          y={center + 10}
          fill={colors.primary}
          fontSize={18}
          fontWeight="800"
          fontFamily={fontFamily.bodyBold}
          textAnchor="middle"
        >
          Has Spoken
        </SvgText>
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {pubs.map((pub, index) => {
        const labelAngle = index * segment + segment / 2;
        const point = polarPoint(center, labelRadius, labelAngle);
        const label = shortenWheelLabel(formatPubLabel(pub));
        const textRotation = labelAngle > 90 && labelAngle < 270 ? labelAngle + 180 : labelAngle;

        return (
          <G key={pub.id || `${pub.name}-${index}`}>
            <Path
              d={createSegmentPath(index, pubs.length, size)}
              fill={WHEEL_COLORS[index % WHEEL_COLORS.length]}
              stroke="rgba(248,250,252,0.42)"
              strokeWidth={1.4}
            />
            <SvgText
              x={point.x}
              y={point.y}
              fill={index % WHEEL_COLORS.length === 3 ? '#111827' : colors.text}
              fontSize={pubs.length > 9 ? 10 : 11}
              fontWeight="800"
              fontFamily={fontFamily.bodyBold}
              textAnchor="middle"
              transform={`rotate(${textRotation} ${point.x} ${point.y})`}
            >
              {label}
            </SvgText>
          </G>
        );
      })}
      <Circle cx={center} cy={center} r={38} fill={colors.surfaceRaised} stroke={colors.primary} strokeWidth={4} />
      <SvgText
        x={center}
        y={center + 5}
        fill={colors.primary}
        fontSize={18}
        fontWeight="800"
        fontFamily={fontFamily.bodyBold}
        textAnchor="middle"
      >
        SPIN
      </SvgText>
    </Svg>
  );
};

export const PubRouletteModal = ({
  visible,
  pubs,
  loading,
  refreshing = false,
  error,
  starting = false,
  onClose,
  onRefresh,
  onUsePub,
  onStartHere,
}: PubRouletteModalProps) => {
  const { width } = useWindowDimensions();
  const wheelSize = Math.min(Math.max(width - 56, 246), 330);
  const rotation = useRef(new Animated.Value(0)).current;
  const rotationValue = useRef(0);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [displayPubs, setDisplayPubs] = useState<PubRecord[]>([]);
  const [winner, setWinner] = useState<PubRecord | null>(null);
  const [spinning, setSpinning] = useState(false);

  const wheelRotation = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
    extrapolate: 'extend',
  });

  useEffect(() => {
    if (!visible) {
      animationRef.current?.stop();
      animationRef.current = null;
      setSpinning(false);
      return;
    }

    rotation.stopAnimation();
    rotation.setValue(0);
    rotationValue.current = 0;
    setDisplayPubs(pubs);
    setWinner(pubs.length === 1 ? pubs[0] : null);
    setSpinning(false);
  }, [rotation, visible]);

  useEffect(() => {
    return () => {
      animationRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!visible || spinning) return;

    if (winner) {
      if (!includesPub(pubs, winner)) {
        setDisplayPubs(pubs);
        setWinner(pubs.length === 1 ? pubs[0] : null);
      }
      return;
    }

    setDisplayPubs(pubs);
    if (pubs.length === 1) {
      setWinner(pubs[0]);
    }
  }, [pubs, spinning, visible, winner]);

  const statusText = useMemo(() => {
    if (loading) return `Finding bars within ${ROULETTE_MAX_DISTANCE_METERS / 1000} km...`;
    if (error) return error;
    if (displayPubs.length === 0) return 'No bars within 1 km yet. Try Nearby or search manually.';
    if (refreshing) return `${displayPubs.length} nearby bars loaded. Refreshing the table...`;
    if (displayPubs.length === 1) return 'Only one nearby bar found. The wheel has spoken.';
    return `${displayPubs.length} nearby bars loaded`;
  }, [displayPubs.length, error, loading, refreshing]);

  const spin = () => {
    const spinPubs = pubs.length > 0 ? pubs : displayPubs;
    if (loading || spinning || spinPubs.length === 0) return;

    setDisplayPubs(spinPubs);

    if (spinPubs.length === 1) {
      setWinner(spinPubs[0]);
      hapticSuccess();
      return;
    }

    const result = pickRouletteWinner(spinPubs);
    if (!result) return;

    const nextRotation = getRouletteTargetRotation(
      result.winnerIndex,
      spinPubs.length,
      rotationValue.current,
      7
    );

    setWinner(null);
    setSpinning(true);
    hapticMedium();

    animationRef.current?.stop();
    const animation = Animated.timing(rotation, {
      toValue: nextRotation,
      duration: 3600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animationRef.current = animation;
    animation.start(({ finished }) => {
      animationRef.current = null;
      setSpinning(false);
      if (!finished) return;
      rotationValue.current = nextRotation;
      setWinner(result.pub);
      hapticSuccess();
    });
  };

  const winnerDetail = winner ? formatPubDetail(winner) : '';
  const canSpin = displayPubs.length > 0 && !loading && !spinning;

  const closeModal = () => {
    animationRef.current?.stop();
    animationRef.current = null;
    setSpinning(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeModal}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Beer Roulette</Text>
              <Text style={styles.title}>Let the wheel decide</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={closeModal} activeOpacity={0.76}>
              <X color={colors.textMuted} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.status, error ? styles.errorText : null]}>{statusText}</Text>

            <View style={styles.wheelStage}>
              <View style={styles.pointer} />
              <Animated.View style={[styles.wheel, { width: wheelSize, height: wheelSize, transform: [{ rotate: wheelRotation }] }]}>
                <RouletteWheel pubs={displayPubs} size={wheelSize} />
              </Animated.View>
              {loading ? (
                <View style={styles.loadingCover}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.spinButton, !canSpin ? styles.spinButtonDisabled : null]}
              onPress={spin}
              disabled={!canSpin}
              activeOpacity={0.78}
            >
              <Sparkles color={colors.background} size={20} />
              <Text style={styles.spinButtonText}>{spinning ? 'Spinning...' : displayPubs.length === 1 ? 'Crown The Bar' : 'Spin The Wheel'}</Text>
            </TouchableOpacity>

            {winner ? (
              <View style={styles.resultCard}>
                <View style={styles.resultIcon}>
                  <CheckCircle2 color={colors.success} size={22} />
                </View>
                <View style={styles.resultText}>
                  <Text style={styles.resultLabel}>Tonight's pick</Text>
                  <Text style={styles.resultName} numberOfLines={2}>{formatPubLabel(winner)}</Text>
                  {winnerDetail ? (
                    <View style={styles.resultMetaRow}>
                      <MapPin color={colors.textMuted} size={14} />
                      <Text style={styles.resultMeta} numberOfLines={2}>{winnerDetail}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.actions}>
              <AppButton
                label="Use This Pub"
                variant="secondary"
                disabled={!winner || starting}
                onPress={() => winner && onUsePub(winner)}
              />
              <AppButton
                label="Start Here"
                disabled={!winner}
                loading={starting}
                onPress={() => winner && onStartHere(winner)}
              />
            </View>

            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
              disabled={loading || refreshing || spinning}
              activeOpacity={0.76}
            >
              <RefreshCw color={colors.primary} size={16} />
              <Text style={styles.refreshText}>{refreshing ? 'Refreshing nearby bars...' : 'Refresh nearby bars'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    maxHeight: '92%',
    borderRadius: 24,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    overflow: 'hidden',
    ...shadows.raised,
  },
  header: {
    minHeight: 78,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#171717',
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryBorder,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    ...typography.h2,
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  status: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
  },
  wheelStage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderTopWidth: 26,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.primary,
    marginBottom: -10,
    zIndex: 3,
  },
  wheel: {
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  loadingCover: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  spinButton: {
    minHeight: 54,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  spinButtonDisabled: {
    opacity: 0.58,
  },
  spinButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '900',
    textAlign: 'center',
  },
  resultCard: {
    alignSelf: 'stretch',
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.32)',
  },
  resultIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successSoft,
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  resultLabel: {
    ...typography.tiny,
    color: colors.success,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  resultName: {
    ...typography.h3,
    marginTop: 2,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  resultMeta: {
    ...typography.caption,
    flex: 1,
    color: colors.textMuted,
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  refreshButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  refreshText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
});
