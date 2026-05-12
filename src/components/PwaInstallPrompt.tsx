import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Download, PlusSquare, Share, X } from 'lucide-react-native';

import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import {
  getBrowserInstallEnvironment,
  getInstallPromptStorage,
  isIosSafari,
  isStandaloneDisplay,
  rememberInstallPromptDismissed,
  wasInstallPromptRecentlyDismissed,
} from '../lib/pwaInstallPrompt';

type InstallPromptMode = 'hidden' | 'native' | 'ios';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const SHOW_GUIDE_DELAY_MS = 900;

export const PwaInstallPrompt = () => {
  const [mode, setMode] = useState<InstallPromptMode>('hidden');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(28)).current;

  const closePrompt = useCallback(() => {
    rememberInstallPromptDismissed(getInstallPromptStorage());
    setMode('hidden');
    setDeferredPrompt(null);
  }, []);

  const showPrompt = useCallback((nextMode: Exclude<InstallPromptMode, 'hidden'>) => {
    setMode(nextMode);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const environment = getBrowserInstallEnvironment();
    const storage = getInstallPromptStorage();
    if (isStandaloneDisplay(environment) || wasInstallPromptRecentlyDismissed(storage)) {
      return undefined;
    }

    let guideTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleNativeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (guideTimeout) {
        clearTimeout(guideTimeout);
        guideTimeout = null;
      }
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      showPrompt('native');
    };

    const handleInstalled = () => {
      rememberInstallPromptDismissed(storage);
      setMode('hidden');
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleNativeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    if (isIosSafari(environment)) {
      guideTimeout = setTimeout(() => showPrompt('ios'), SHOW_GUIDE_DELAY_MS);
    }

    return () => {
      if (guideTimeout) clearTimeout(guideTimeout);
      window.removeEventListener('beforeinstallprompt', handleNativeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [showPrompt]);

  useEffect(() => {
    if (mode === 'hidden') {
      opacity.setValue(0);
      translateY.setValue(28);
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 7,
        tension: 58,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mode, opacity, translateY]);

  const installNativeApp = useCallback(async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice?.catch(() => null);
      if (choice?.outcome === 'accepted' || choice?.outcome === 'dismissed') {
        rememberInstallPromptDismissed(getInstallPromptStorage());
      }
    } finally {
      rememberInstallPromptDismissed(getInstallPromptStorage());
      setMode('hidden');
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  if (Platform.OS !== 'web' || mode === 'hidden') return null;

  const isNativeMode = mode === 'native';
  const title = isNativeMode ? 'Install Beerva' : 'Add Beerva to your Home Screen';
  const description = isNativeMode
    ? 'Open Beerva straight from your home screen with the faster app-style experience.'
    : 'iPhone Safari does not allow a one-tap install button, but this takes about ten seconds.';

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={closePrompt}
        accessibilityRole="button"
        accessibilityLabel="Dismiss install prompt"
      />
      <Animated.View
        style={[
          styles.card,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.iconBadge}>
            <Download color={colors.background} size={22} />
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={closePrompt}
            accessibilityRole="button"
            accessibilityLabel="Close install prompt"
          >
            <X color={colors.textMuted} size={18} />
          </Pressable>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        {isNativeMode ? null : (
          <View style={styles.steps}>
            <View style={styles.step}>
              <View style={styles.stepIcon}>
                <Share color={colors.primary} size={18} />
              </View>
              <Text style={styles.stepText}>Tap the Share button</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepIcon}>
                <PlusSquare color={colors.primary} size={18} />
              </View>
              <Text style={styles.stepText}>Choose Add to Home Screen</Text>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {isNativeMode ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={installNativeApp}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Install Beerva"
            >
              <Text style={styles.primaryButtonText}>Install</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={closePrompt}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Close install instructions"
            >
              <Text style={styles.primaryButtonText}>Got it</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={closePrompt}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Maybe later"
          >
            <Text style={styles.secondaryButtonText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 95,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.54)',
  },
  card: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.raised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  title: {
    ...typography.h2,
    fontSize: 22,
    lineHeight: 28,
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
  },
  steps: {
    gap: spacing.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  stepText: {
    ...typography.caption,
    flex: 1,
    color: colors.text,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  secondaryButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
  },
});
