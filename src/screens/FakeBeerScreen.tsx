import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X } from 'lucide-react-native';
import { Accelerometer, DeviceMotion } from 'expo-sensors';

import { FakeBeerVisual } from '../components/FakeBeerVisual';
import {
  createFakeBeerMotionBaseline,
  getFakeBeerMotionSignal,
  type FakeBeerMotionBaseline,
  type FakeBeerMotionReading,
} from '../lib/fakeBeerMotion';
import { hapticLight } from '../lib/haptics';
import { queryWebMotionPermissionState, requestWebMotionPermission } from '../lib/webMotionPermission';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';

const SENSOR_UPDATE_MS = 80;
const DEVICE_MOTION_WATCHDOG_MS = 650;
const LIQUID_RESPONSE_MS = 50;
const LIQUID_TILT_EASE = 0.16;
const MAX_SLOSH_OFFSET = 18;
const REFILL_MS = 900;
const MAX_SIP_AMOUNT = 0.022;
const SIP_MULTIPLIER = 0.014;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sensorDegreesToRadians = (value: number) => value * Math.PI / 180;
const isFiniteSensorNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);
const getBrowserGravityVector = (gravity: any) => {
  if (
    !gravity
    || !isFiniteSensorNumber(gravity.x)
    || !isFiniteSensorNumber(gravity.y)
    || !isFiniteSensorNumber(gravity.z)
  ) {
    return null;
  }

  return {
    x: gravity.x,
    y: gravity.y,
    z: gravity.z,
  };
};

type WebSensorDebugState = {
  secureContext: string;
  motionApi: string;
  orientationApi: string;
  genericApi: string;
  permissionRequest: string;
  accelerometerPermission: string;
  gyroscopePermission: string;
  motionEvents: number;
  orientationEvents: number;
  genericEvents: number;
  genericError: string | null;
};

const getInitialWebSensorDebug = (): WebSensorDebugState => ({
  secureContext: 'unknown',
  motionApi: 'unknown',
  orientationApi: 'unknown',
  genericApi: 'unknown',
  permissionRequest: 'unknown',
  accelerometerPermission: 'unknown',
  gyroscopePermission: 'unknown',
  motionEvents: 0,
  orientationEvents: 0,
  genericEvents: 0,
  genericError: null,
});

const getErrorMessage = (error: unknown) => {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
};

export const FakeBeerScreen = () => {
  const navigation = useNavigation<any>();
  const [fillLevel, setFillLevel] = useState(1);
  const [liquidTiltDegrees, setLiquidTiltDegrees] = useState(0);
  const [sloshOffset, setSloshOffset] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [sensorSource, setSensorSource] = useState('Fallback (Sine Wave)');
  const [webSensorDebug, setWebSensorDebug] = useState<WebSensorDebugState>(getInitialWebSensorDebug);
  const lastTapTimeRef = useRef<number>(0);
  const lastReadingRef = useRef<FakeBeerMotionReading | null>(null);
  const refillAnimation = useRef(new Animated.Value(1)).current;
  const targetTiltDegreesRef = useRef(0);
  const liquidTiltDegreesRef = useRef(0);
  const renderedLiquidTiltRef = useRef(0);
  const renderedSloshOffsetRef = useRef(0);
  const deviceMotionBaselineRef = useRef<FakeBeerMotionBaseline | null>(null);
  const accelerometerBaselineRef = useRef<FakeBeerMotionBaseline | null>(null);
  const browserOrientationBaselineRef = useRef<FakeBeerMotionBaseline | null>(null);
  const genericSensorBaselineRef = useRef<FakeBeerMotionBaseline | null>(null);
  const hasAccelerometerReadingRef = useRef(false);
  const hasDeviceMotionReadingRef = useRef(false);
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

  const handleMotionReading = useCallback((
    reading: FakeBeerMotionReading,
    baselineRef: React.MutableRefObject<FakeBeerMotionBaseline | null>,
    allowsDrinking: boolean
  ) => {
    lastReadingRef.current = reading;
    if (!baselineRef.current) {
      baselineRef.current = createFakeBeerMotionBaseline(reading);
    }

    const motionSignal = getFakeBeerMotionSignal(reading, baselineRef.current);
    targetTiltDegreesRef.current = motionSignal.tiltDegrees;

    if (allowsDrinking && motionSignal.drinkPressure > 0) {
      sipBeer(Math.min(MAX_SIP_AMOUNT, motionSignal.drinkPressure * SIP_MULTIPLIER));
    }
  }, [sipBeer]);

  useEffect(() => {
    const interval = setInterval(() => {
      const targetTilt = targetTiltDegreesRef.current;
      const currentTilt = liquidTiltDegreesRef.current;
      const nextTilt = currentTilt + (targetTilt - currentTilt) * LIQUID_TILT_EASE;
      const nextSloshOffset = clamp((targetTilt - nextTilt) * 0.95, -MAX_SLOSH_OFFSET, MAX_SLOSH_OFFSET);
      const roundedTilt = Math.round(nextTilt * 10) / 10;
      const roundedSlosh = Math.round(nextSloshOffset * 10) / 10;

      liquidTiltDegreesRef.current = Math.abs(nextTilt) < 0.04 ? 0 : nextTilt;

      if (Math.abs(renderedLiquidTiltRef.current - roundedTilt) > 0.05) {
        renderedLiquidTiltRef.current = roundedTilt;
        setLiquidTiltDegrees(roundedTilt);
      }

      if (Math.abs(renderedSloshOffsetRef.current - roundedSlosh) > 0.05) {
        renderedSloshOffsetRef.current = roundedSlosh;
        setSloshOffset(roundedSlosh);
      }
    }, LIQUID_RESPONSE_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    let motionSubscription: { remove: () => void } | null = null;
    let accelerometerSubscription: { remove: () => void } | null = null;
    let deviceMotionWatchdogTimeout: ReturnType<typeof setTimeout> | null = null;
    let accelerometerWatchdogTimeout: ReturnType<typeof setTimeout> | null = null;
    let browserDeviceMotionListener: ((event: DeviceMotionEvent) => void) | null = null;
    let browserDeviceOrientationListener: ((event: DeviceOrientationEvent) => void) | null = null;
    let webSensorWatchdogTimeout: ReturnType<typeof setTimeout> | null = null;
    let genericSensor: any = null;
    let genericSensorReadingListener: (() => void) | null = null;
    let genericSensorErrorListener: ((event: any) => void) | null = null;
    let browserMotionEventCount = 0;
    let browserOrientationEventCount = 0;
    let genericSensorEventCount = 0;
    let browserGravityReadingCount = 0;

    const clearDeviceMotionWatchdog = () => {
      if (deviceMotionWatchdogTimeout) {
        clearTimeout(deviceMotionWatchdogTimeout);
        deviceMotionWatchdogTimeout = null;
      }
    };

    const clearAccelerometerWatchdog = () => {
      if (accelerometerWatchdogTimeout) {
        clearTimeout(accelerometerWatchdogTimeout);
        accelerometerWatchdogTimeout = null;
      }
    };

    const clearWebSensorWatchdog = () => {
      if (webSensorWatchdogTimeout) {
        clearTimeout(webSensorWatchdogTimeout);
        webSensorWatchdogTimeout = null;
      }
    };

    const clearFallbackMotion = () => {
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };

    const startFallbackMotion = () => {
      if (fallbackIntervalRef.current) return;
      setSensorSource('Fallback (Sine Wave)');
      fallbackIntervalRef.current = setInterval(() => {
        targetTiltDegreesRef.current = Math.sin(Date.now() / 420) * 10;
      }, SENSOR_UPDATE_MS);
    };

    const markDeviceMotionActive = (source: string) => {
      hasDeviceMotionReadingRef.current = true;
      clearDeviceMotionWatchdog();
      clearWebSensorWatchdog();
      clearFallbackMotion();
      setSensorSource((current) => current === source ? current : source);

      if (accelerometerSubscription) {
        accelerometerSubscription.remove();
        accelerometerSubscription = null;
        hasAccelerometerReadingRef.current = false;
        clearAccelerometerWatchdog();
      }
    };

    const updateWebEventCount = (
      key: 'motionEvents' | 'orientationEvents' | 'genericEvents',
      value: number
    ) => {
      if (value <= 3 || value % 20 === 0) {
        setWebSensorDebug((current) => ({ ...current, [key]: value }));
      }
    };

    const startAccelerometerMotion = () => {
      if (accelerometerSubscription) return;

      try {
        Accelerometer.setUpdateInterval(SENSOR_UPDATE_MS);
        accelerometerSubscription = Accelerometer.addListener((gravity) => {
          clearAccelerometerWatchdog();
          clearFallbackMotion();
          hasAccelerometerReadingRef.current = true;
          handleMotionReading(
            { accelerationIncludingGravity: gravity },
            accelerometerBaselineRef,
            true
          );
        });

        accelerometerWatchdogTimeout = setTimeout(() => {
          if (!active || hasAccelerometerReadingRef.current) return;
          startFallbackMotion();
        }, 1000);
      } catch (err) {
        startFallbackMotion();
      }
    };

    if (Platform.OS !== 'web') {
      startAccelerometerMotion();
      DeviceMotion.setUpdateInterval(SENSOR_UPDATE_MS);

      try {
        let deviceMotionReadingCount = 0;
        motionSubscription = DeviceMotion.addListener((motion) => {
          const hasGravity = motion.accelerationIncludingGravity &&
                             typeof motion.accelerationIncludingGravity.x === 'number' &&
                             typeof motion.accelerationIncludingGravity.y === 'number' &&
                             typeof motion.accelerationIncludingGravity.z === 'number';
          const hasRotation = motion.rotation &&
                              typeof motion.rotation.beta === 'number' &&
                              typeof motion.rotation.gamma === 'number';

          if (!hasGravity && !hasRotation) {
            return;
          }

          deviceMotionReadingCount++;
          if (deviceMotionReadingCount >= 3) {
            markDeviceMotionActive('Expo DeviceMotion');
          }

          handleMotionReading(
            motion,
            deviceMotionBaselineRef,
            true
          );
        });

        deviceMotionWatchdogTimeout = setTimeout(() => {
          if (!active || hasDeviceMotionReadingRef.current) return;

          // Do not remove the subscription as it might kill Accelerometer on Android
        }, DEVICE_MOTION_WATCHDOG_MS);
      } catch (err) {
        // DeviceMotion not supported
      }
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const globalSensors = globalThis as Record<string, any>;
      const GenericSensorConstructor = globalSensors.GravitySensor || globalSensors.Accelerometer;
      const genericApi = globalSensors.GravitySensor
        ? 'GravitySensor'
        : globalSensors.Accelerometer
          ? 'Accelerometer'
          : 'missing';

      setWebSensorDebug((current) => ({
        ...current,
        secureContext: String(window.isSecureContext),
        motionApi: String(typeof DeviceMotionEvent !== 'undefined'),
        orientationApi: String(typeof DeviceOrientationEvent !== 'undefined'),
        genericApi,
      }));

      queryWebMotionPermissionState()
        .then(({ accelerometer, gyroscope }) => {
          if (!active) return;
          setWebSensorDebug((current) => ({
            ...current,
            accelerometerPermission: accelerometer,
            gyroscopePermission: gyroscope,
          }));
        })
        .catch((error) => {
          if (!active) return;
          setWebSensorDebug((current) => ({
            ...current,
            genericError: getErrorMessage(error),
          }));
        });

      if (GenericSensorConstructor) {
        try {
          genericSensor = new GenericSensorConstructor({
            frequency: Math.max(1, Math.round(1000 / SENSOR_UPDATE_MS)),
          });

          genericSensorReadingListener = () => {
            if (!active || !genericSensor) return;

            const gravity = getBrowserGravityVector(genericSensor);
            if (!gravity) return;

            genericSensorEventCount++;
            updateWebEventCount('genericEvents', genericSensorEventCount);
            markDeviceMotionActive(`Generic ${genericApi}`);
            handleMotionReading(
              { accelerationIncludingGravity: gravity },
              genericSensorBaselineRef,
              browserGravityReadingCount === 0
            );
          };

          genericSensorErrorListener = (event: any) => {
            if (!active) return;
            setWebSensorDebug((current) => ({
              ...current,
              genericError: getErrorMessage(event?.error ?? event),
            }));
          };

          genericSensor.addEventListener('reading', genericSensorReadingListener);
          genericSensor.addEventListener('error', genericSensorErrorListener);
          genericSensor.start();
        } catch (error) {
          setWebSensorDebug((current) => ({
            ...current,
            genericError: getErrorMessage(error),
          }));
        }
      }

      browserDeviceMotionListener = (event: DeviceMotionEvent) => {
        const gravity = getBrowserGravityVector(event.accelerationIncludingGravity);
        if (!gravity) return;

        browserMotionEventCount++;
        browserGravityReadingCount++;
        updateWebEventCount('motionEvents', browserMotionEventCount);
        markDeviceMotionActive('Browser DeviceMotion');
        handleMotionReading(
          { accelerationIncludingGravity: gravity },
          deviceMotionBaselineRef,
          true
        );
      };

      browserDeviceOrientationListener = (event: DeviceOrientationEvent) => {
        if (!isFiniteSensorNumber(event.beta) || !isFiniteSensorNumber(event.gamma)) return;

        browserOrientationEventCount++;
        updateWebEventCount('orientationEvents', browserOrientationEventCount);
        markDeviceMotionActive('Browser DeviceOrientation');
        handleMotionReading(
          {
            rotation: {
              beta: sensorDegreesToRadians(event.beta),
              gamma: sensorDegreesToRadians(event.gamma),
            },
          },
          browserOrientationBaselineRef,
          browserGravityReadingCount === 0
        );
      };

      window.addEventListener('devicemotion', browserDeviceMotionListener);
      window.addEventListener('deviceorientation', browserDeviceOrientationListener);

      webSensorWatchdogTimeout = setTimeout(() => {
        if (!active || hasDeviceMotionReadingRef.current) return;
        startFallbackMotion();
      }, 1400);
    }

    return () => {
      active = false;
      clearDeviceMotionWatchdog();
      clearAccelerometerWatchdog();
      clearWebSensorWatchdog();
      if (genericSensor) {
        if (genericSensorReadingListener) {
          genericSensor.removeEventListener('reading', genericSensorReadingListener);
        }
        if (genericSensorErrorListener) {
          genericSensor.removeEventListener('error', genericSensorErrorListener);
        }
        genericSensor.stop?.();
      }
      if (browserDeviceMotionListener && typeof window !== 'undefined') {
        window.removeEventListener('devicemotion', browserDeviceMotionListener);
      }
      if (browserDeviceOrientationListener && typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', browserDeviceOrientationListener);
      }
      motionSubscription?.remove();
      accelerometerSubscription?.remove();
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [handleMotionReading]);

  const handleScreenPress = useCallback(async () => {
    if (Platform.OS === 'web') {
      const permissionRequest = await requestWebMotionPermission();
      const { accelerometer, gyroscope } = await queryWebMotionPermissionState();
      setWebSensorDebug((current) => ({
        ...current,
        permissionRequest,
        accelerometerPermission: accelerometer,
        gyroscopePermission: gyroscope,
      }));
      sipBeer(0.08);
    }

    const now = Date.now();
    if (now - lastTapTimeRef.current > 2000) {
      setTapCount(1);
    } else {
      const nextCount = tapCount + 1;
      if (nextCount >= 5) {
        setShowDebug((prev) => !prev);
        setTapCount(0);
      } else {
        setTapCount(nextCount);
      }
    }
    lastTapTimeRef.current = now;
  }, [sipBeer, tapCount]);

  return (
    <Pressable style={styles.container} onPress={handleScreenPress}>
      <FakeBeerVisual
        fillLevel={fillLevel}
        tiltDegrees={liquidTiltDegrees}
        sloshOffset={sloshOffset}
        showHint={showHint}
      />

      {showDebug && (
        <View style={styles.debugPanel} pointerEvents="none">
          <Text style={styles.debugText}>OS: {Platform.OS}</Text>
          <Text style={styles.debugText}>
            Sensor Source: {sensorSource}
          </Text>
          {Platform.OS === 'web' && (
            <>
              <Text style={styles.debugText}>
                Permission: req {webSensorDebug.permissionRequest} / acc {webSensorDebug.accelerometerPermission} / gyro {webSensorDebug.gyroscopePermission}
              </Text>
              <Text style={styles.debugText}>
                APIs: https {webSensorDebug.secureContext} / motion {webSensorDebug.motionApi} / orient {webSensorDebug.orientationApi} / generic {webSensorDebug.genericApi}
              </Text>
              <Text style={styles.debugText}>
                Events: motion {webSensorDebug.motionEvents} / orient {webSensorDebug.orientationEvents} / generic {webSensorDebug.genericEvents}
              </Text>
              <Text style={styles.debugText}>
                Generic Error: {webSensorDebug.genericError || 'none'}
              </Text>
            </>
          )}
          <Text style={styles.debugText}>
            Fill Level: {(fillLevel * 100).toFixed(1)}%
          </Text>
          <Text style={styles.debugText}>
            Tilt: {targetTiltDegreesRef.current.toFixed(1)}° (liq: {liquidTiltDegrees.toFixed(1)}°)
          </Text>
          {lastReadingRef.current?.rotation && (
            <Text style={styles.debugText}>
              Rot Beta: {lastReadingRef.current.rotation.beta?.toFixed(3)} (Base: {deviceMotionBaselineRef.current?.betaRadians?.toFixed(3)})
            </Text>
          )}
          {lastReadingRef.current?.accelerationIncludingGravity && (
            <Text style={styles.debugText}>
              Accel Y/Z: {lastReadingRef.current.accelerationIncludingGravity.y?.toFixed(2)} / {lastReadingRef.current.accelerationIncludingGravity.z?.toFixed(2)} (Base Y/Z: {accelerometerBaselineRef.current?.gravityPitchRadians?.toFixed(3)})
            </Text>
          )}
          <Text style={styles.debugText}>
            Drink Delta: {(() => {
              const signal = getFakeBeerMotionSignal(
                lastReadingRef.current || {},
                hasDeviceMotionReadingRef.current ? deviceMotionBaselineRef.current : accelerometerBaselineRef.current
              );
              return signal.drinkPressure.toFixed(3);
            })()}
          </Text>
        </View>
      )}

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
  debugPanel: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 9999,
  },
  debugText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
  },
});
