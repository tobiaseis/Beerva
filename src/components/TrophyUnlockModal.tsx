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
    color: '#FACC15',
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
    backgroundColor: '#2A063D',
    borderWidth: 2,
    borderColor: '#FACC15',
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
});
