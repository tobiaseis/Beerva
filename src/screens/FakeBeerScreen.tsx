import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X } from 'lucide-react-native';
import { DeviceMotion } from 'expo-sensors';

import { FakeBeerVisual } from '../components/FakeBeerVisual';
import { hapticLight } from '../lib/haptics';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';

const DRINK_TILT_THRESHOLD = 0.72;
const SENSOR_UPDATE_MS = 80;
const REFILL_MS = 900;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const FakeBeerScreen = () => {
  const navigation = useNavigation<any>();
  const [fillLevel, setFillLevel] = useState(1);
  const [tiltDegrees, setTiltDegrees] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const refillAnimation = useRef(new Animated.Value(1)).current;
  const refillingRef = useRef(false);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setShowHint(false), 2200);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const listenerId = refillAnimation.addListener(({ value }) => {
      if (refillingRef.current) {
        setFillLevel(value);
      }
    });

    return () => {
      refillAnimation.removeListener(listenerId);
    };
  }, [refillAnimation]);

  const triggerRefill = useCallback(() => {
    if (refillingRef.current) return;

    refillingRef.current = true;
    hapticLight();
    refillAnimation.setValue(0);
    setFillLevel(0);
    Animated.timing(refillAnimation, {
      toValue: 1,
      duration: REFILL_MS,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setFillLevel(1);
      }
      refillingRef.current = false;
    });
  }, [refillAnimation]);

  const sipBeer = useCallback((amount: number) => {
    if (refillingRef.current) return;

    setFillLevel((current) => {
      const next = clamp(current - amount, 0, 1);
      if (next <= 0.01) {
        requestAnimationFrame(triggerRefill);
        return 0;
      }
      return next;
    });
  }, [triggerRefill]);

  useEffect(() => {
    let active = true;
    let motionSubscription: { remove: () => void } | null = null;

    const startFallbackMotion = () => {
      if (fallbackIntervalRef.current) return;
      fallbackIntervalRef.current = setInterval(() => {
        setTiltDegrees(Math.sin(Date.now() / 420) * 8);
      }, SENSOR_UPDATE_MS);
    };

    DeviceMotion.setUpdateInterval(SENSOR_UPDATE_MS);
    DeviceMotion.isAvailableAsync()
      .then((available) => {
        if (!active) return;

        if (!available) {
          startFallbackMotion();
          return;
        }

        motionSubscription = DeviceMotion.addListener((motion) => {
          const beta = motion.rotation?.beta || 0;
          const gamma = motion.rotation?.gamma || 0;
          const nextTilt = clamp(gamma * 34, -22, 22);
          const drinkPressure = Math.max(0, Math.abs(beta) - DRINK_TILT_THRESHOLD);

          setTiltDegrees(nextTilt);

          if (drinkPressure > 0) {
            sipBeer(Math.min(0.035, drinkPressure * 0.018));
          }
        });
      })
      .catch(() => {
        if (active) {
          startFallbackMotion();
        }
      });

    return () => {
      active = false;
      motionSubscription?.remove();
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [sipBeer]);

  const handleFallbackSip = useCallback(() => {
    if (Platform.OS === 'web') {
      sipBeer(0.08);
    }
  }, [sipBeer]);

  return (
    <Pressable style={styles.container} onPress={handleFallbackSip}>
      <FakeBeerVisual fillLevel={fillLevel} tiltDegrees={tiltDegrees} showHint={showHint} />
      <Pressable
        style={styles.closeButton}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Close fake beer"
        hitSlop={12}
      >
        <X color={colors.text} size={20} />
      </Pressable>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D98505',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 18 : 54,
    right: 18,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 18, 26, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
});
