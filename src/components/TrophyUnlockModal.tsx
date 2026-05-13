import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, TouchableOpacity, Easing } from 'react-native';
import { TrophyDefinition } from '../lib/profileStats';
import { renderTrophyIcon } from './ProfileStatsPanel';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, shadows } from '../theme/layout';

type Props = {
  trophy: TrophyDefinition | null;
  onClose: () => void;
};

type AllTrophiesUnlockedModalProps = {
  visible: boolean;
  onClose: () => void;
};

const prizeColors = ['#FACC15', '#FB7185', '#38BDF8', '#A78BFA', '#34D399', '#F97316', '#F472B6', '#22D3EE'];
const prizeDots: Array<{ top?: number; right?: number; bottom?: number; left?: number; size: number }> = [
  { top: 42, left: 38, size: 10 },
  { top: 58, right: 42, size: 8 },
  { top: 146, left: 24, size: 7 },
  { bottom: 82, left: 48, size: 11 },
  { bottom: 64, right: 46, size: 9 },
  { top: 164, right: 26, size: 6 },
];

export const TrophyUnlockModal = ({ trophy, onClose }: Props) => {
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.5)).current;
  const contentTranslateY = useRef(new Animated.Value(40)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const raysRotate = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trophy) {
      Animated.sequence([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.spring(contentScale, {
            toValue: 1,
            friction: 6,
            tension: 40,
            useNativeDriver: true,
          }),
          Animated.spring(contentTranslateY, {
            toValue: 0,
            friction: 6,
            tension: 40,
            useNativeDriver: true,
          }),
          Animated.spring(iconScale, {
            toValue: 1,
            friction: 4,
            tension: 60,
            useNativeDriver: true,
            delay: 150,
          }),
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 400,
            delay: 250,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      Animated.loop(
        Animated.timing(raysRotate, {
          toValue: 1,
          duration: 10000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      backdropOpacity.setValue(0);
      contentScale.setValue(0.5);
      contentTranslateY.setValue(40);
      iconScale.setValue(0);
      raysRotate.setValue(0);
      textOpacity.setValue(0);
    }
  }, [trophy, backdropOpacity, contentScale, contentTranslateY, iconScale, raysRotate, textOpacity]);

  if (!trophy) return null;

  const spin = raysRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const rays = Array.from({ length: 12 }).map((_, i) => (
    <View
      key={i}
      style={[
        styles.ray,
        { transform: [{ rotate: `${i * 30}deg` }, { translateY: -45 }] }
      ]}
    />
  ));

  return (
    <Modal transparent visible={!!trophy} animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        </Animated.View>
        <View style={styles.center}>
          <Animated.View style={[
            styles.card,
            { 
              opacity: backdropOpacity,
              transform: [{ scale: contentScale }, { translateY: contentTranslateY }] 
            }
          ]}>
            <Text style={styles.header}>New Trophy Unlocked!</Text>
            
            <View style={styles.iconStage}>
              <Animated.View style={[styles.raysContainer, { transform: [{ rotate: spin }] }]}>
                {rays}
              </Animated.View>
              <Animated.View style={[styles.iconContainer, { transform: [{ scale: iconScale }] }]}>
                {renderTrophyIcon(trophy.kind, true, 56)}
              </Animated.View>
            </View>

            <Animated.View style={{ opacity: textOpacity, alignItems: 'center', width: '100%' }}>
              <Text style={styles.title}>{trophy.title}</Text>
              <Text style={styles.description}>{trophy.description}</Text>
              <TouchableOpacity style={styles.button} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.buttonText}>Awesome</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
};

export const AllTrophiesUnlockedModal = ({ visible, onClose }: AllTrophiesUnlockedModalProps) => {
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.76)).current;
  const contentTranslateY = useRef(new Animated.Value(34)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const prizeSpin = useRef(new Animated.Value(0)).current;
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    spinLoopRef.current?.stop();
    spinLoopRef.current = null;

    if (!visible) {
      backdropOpacity.setValue(0);
      contentScale.setValue(0.76);
      contentTranslateY.setValue(34);
      textOpacity.setValue(0);
      prizeSpin.setValue(0);
      return undefined;
    }

    backdropOpacity.setValue(0);
    contentScale.setValue(0.76);
    contentTranslateY.setValue(34);
    textOpacity.setValue(0);
    prizeSpin.setValue(0);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(contentScale, {
        toValue: 1,
        friction: 5,
        tension: 64,
        useNativeDriver: true,
      }),
      Animated.spring(contentTranslateY, {
        toValue: 0,
        friction: 6,
        tension: 54,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 420,
        delay: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    const spinLoop = Animated.loop(
      Animated.timing(prizeSpin, {
        toValue: 1,
        duration: 6500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinLoopRef.current = spinLoop;
    spinLoop.start();

    return () => {
      spinLoop.stop();
      spinLoopRef.current = null;
    };
  }, [visible, backdropOpacity, contentScale, contentTranslateY, textOpacity, prizeSpin]);

  if (!visible) return null;

  const spin = prizeSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const prizeRays = prizeColors.map((backgroundColor, index) => (
    <View
      key={backgroundColor}
      style={[
        styles.prizeRay,
        {
          backgroundColor,
          transform: [{ rotate: `${index * (360 / prizeColors.length)}deg` }, { translateY: -102 }],
        },
      ]}
    />
  ));

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        </Animated.View>
        <View style={styles.center}>
          <Animated.View
            style={[
              styles.prizeCard,
              {
                opacity: backdropOpacity,
                transform: [{ scale: contentScale }, { translateY: contentTranslateY }],
              },
            ]}
          >
            <Animated.View style={[styles.prizeBurst, { transform: [{ rotate: spin }] }]}>
              {prizeRays}
            </Animated.View>
            {prizeDots.map((dot, index) => (
              <View
                key={index}
                style={[
                  styles.prizeDot,
                  {
                    top: dot.top,
                    left: dot.left,
                    right: dot.right,
                    bottom: dot.bottom,
                    width: dot.size,
                    height: dot.size,
                    borderRadius: dot.size / 2,
                    backgroundColor: prizeColors[index % prizeColors.length],
                  },
                ]}
              />
            ))}

            <Animated.View style={[styles.prizeCopy, { opacity: textOpacity }]}>
              <Text style={styles.prizeWow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                WOW!
              </Text>
              <Text style={styles.prizeMessage}>
                You have unlocked all trophies. Congratulations on needing a new liver!
              </Text>
              <TouchableOpacity
                style={styles.prizeButton}
                onPress={onClose}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Close all trophies prize"
              >
                <Text style={styles.prizeButtonText}>Claim prize</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  header: {
    ...typography.caption,
    fontWeight: '900',
    color: colors.primary,
    marginBottom: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  iconStage: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  raysContainer: {
    position: 'absolute',
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ray: {
    position: 'absolute',
    width: 4,
    height: 90,
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    borderRadius: 2,
  },
  iconContainer: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.raised,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: radius.pill,
    width: '100%',
  },
  buttonText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.background,
    textAlign: 'center',
  },
  prizeCard: {
    width: '100%',
    maxWidth: 380,
    minHeight: 360,
    paddingHorizontal: 26,
    paddingVertical: 30,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.card,
  },
  prizeBurst: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.36,
  },
  prizeRay: {
    position: 'absolute',
    width: 14,
    height: 134,
    borderRadius: 7,
  },
  prizeDot: {
    position: 'absolute',
  },
  prizeCopy: {
    width: '100%',
    alignItems: 'center',
  },
  prizeWow: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 62,
    lineHeight: 68,
    color: colors.primary,
    textAlign: 'center',
    textShadowColor: colors.primaryBorder,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  prizeMessage: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 18,
    marginBottom: 28,
    fontWeight: '800',
  },
  prizeButton: {
    width: '100%',
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: colors.primary,
  },
  prizeButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '900',
    textAlign: 'center',
  },
});
