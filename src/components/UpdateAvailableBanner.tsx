import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, Animated, Platform, View } from 'react-native';
import { RefreshCw, X } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, shadows } from '../theme/layout';
import { applyServiceWorkerUpdate } from '../lib/pushNotifications';

export const UpdateAvailableBanner = () => {
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleUpdateAvailable = () => {
      setVisible(true);
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }).start();
    };

    window.addEventListener('appUpdateAvailable', handleUpdateAvailable);

    return () => {
      window.removeEventListener('appUpdateAvailable', handleUpdateAvailable);
    };
  }, [translateY]);

  const handleRefresh = () => {
    // Animate out slightly before reloading for a smoother feel
    Animated.timing(translateY, {
      toValue: -100,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      applyServiceWorkerUpdate();
    });
  };

  const handleDismiss = () => {
    Animated.timing(translateY, {
      toValue: -100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
    });
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.subtitle}>A new version of Beerva is ready.</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} activeOpacity={0.7}>
            <RefreshCw color={colors.background} size={14} />
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={handleDismiss} hitSlop={10} activeOpacity={0.6}>
            <X color={colors.textMuted} size={18} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 48,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadows.raised,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    ...typography.label,
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.bodyMuted,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    gap: 6,
  },
  refreshText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 13,
  },
  closeButton: {
    padding: 4,
  },
});
