import 'react-native-url-polyfill/auto';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Righteous_400Regular } from '@expo-google-fonts/righteous/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';
import { registerServiceWorker } from './src/lib/pushNotifications';
import { ErrorBoundary } from './src/components/ErrorBoundary';

const beervaLogo = require('./assets/beerva-header-logo.png');

const SPLASH_HOLD_MS = 600;
const SPLASH_FADE_MS = 400;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Righteous_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const fontsReady = fontsLoaded || Boolean(fontError);

  const [splashDone, setSplashDone] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;

  useEffect(() => {
    if (Platform.OS === 'web') {
      registerServiceWorker();
    }
  }, []);

  // Animate logo scale-up on mount
  useEffect(() => {
    Animated.spring(logoScale, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [logoScale]);

  // Once fonts are loaded, hold splash briefly then fade out
  useEffect(() => {
    if (!fontsReady) return;

    const timeout = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: SPLASH_FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setSplashDone(true);
      });
    }, SPLASH_HOLD_MS);

    return () => clearTimeout(timeout);
  }, [fontsReady, splashOpacity]);

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <ErrorBoundary>
        <View style={styles.appShell}>
          {fontsReady && splashDone ? (
            <RootNavigator />
          ) : null}

          {/* Splash overlay – renders on top, fades out */}
          {!splashDone ? (
            <Animated.View style={[styles.splash, { opacity: splashOpacity }]} pointerEvents="none">
              <Animated.View style={{ transform: [{ scale: logoScale }] }}>
                <Image source={beervaLogo} style={styles.splashLogo} />
              </Animated.View>
              <Animated.Text style={[styles.splashTitle, { transform: [{ scale: logoScale }] }]}>
                Beerva
              </Animated.Text>
            </Animated.View>
          ) : null}
        </View>
      </ErrorBoundary>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appShell: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? {
      width: '100%',
      maxWidth: 680,
      alignSelf: 'center',
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    } : null),
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  splashLogo: {
    width: 96,
    height: 92,
    resizeMode: 'contain',
  },
  splashTitle: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 44,
    color: colors.primary,
    marginTop: 16,
  },
});
