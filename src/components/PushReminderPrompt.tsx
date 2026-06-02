import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, UserCircle, X } from 'lucide-react-native';

import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { showAlert } from '../lib/dialogs';
import {
  enablePushNotifications,
  getPushPermissionStatus,
  getPushSupportInfo,
  isCurrentlySubscribed,
} from '../lib/pushNotifications';
import {
  getPushReminderStorage,
  rememberPushReminderSeen,
  shouldShowPushReminder,
} from '../lib/pushReminderPrompt';
import { supabase } from '../lib/supabase';

type PushReminderPromptProps = {
  onShowProfileHint: () => void;
};

const SHOW_REMINDER_DELAY_MS = 1200;

export const PushReminderPrompt = ({ onShowProfileHint }: PushReminderPromptProps) => {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    let active = true;
    const timeout = setTimeout(() => {
      const checkEligibility = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const currentUserId = user?.id || null;
        if (!currentUserId) return;

        const support = getPushSupportInfo();
        const permission = getPushPermissionStatus();
        const storage = getPushReminderStorage();
        const subscribed = support.supported ? await isCurrentlySubscribed() : false;

        if (!active) return;
        if (shouldShowPushReminder({
          userId: currentUserId,
          support,
          permission,
          subscribed,
          storage,
        })) {
          setUserId(currentUserId);
          setVisible(true);
        }
      };

      checkEligibility().catch((error) => {
        console.warn('Could not check push reminder eligibility:', error);
      });
    }, SHOW_REMINDER_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
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
  }, [opacity, translateY, visible]);

  const rememberAndClose = useCallback(() => {
    rememberPushReminderSeen(getPushReminderStorage(), userId);
    setVisible(false);
  }, [userId]);

  const enableNow = useCallback(async () => {
    if (busy) return;

    setBusy(true);
    try {
      const result = await enablePushNotifications();
      if (result.ok) {
        rememberAndClose();
        showAlert('Push notifications on', 'We will buzz you when someone cheers, comments, or invites you.');
        return;
      }

      const status = getPushPermissionStatus();
      if (status === 'denied') {
        showAlert(
          'Notifications blocked',
          'Your browser is blocking notifications for Beerva. Re-enable them in your browser settings, then try again.'
        );
      } else {
        showAlert('Could not enable push', result.reason || 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, rememberAndClose]);

  const showWhere = useCallback(() => {
    rememberAndClose();
    onShowProfileHint();
  }, [onShowProfileHint, rememberAndClose]);

  if (Platform.OS !== 'web' || !visible) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={rememberAndClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss push notification reminder"
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
            <Bell color={colors.background} size={22} />
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={rememberAndClose}
            accessibilityRole="button"
            accessibilityLabel="Close push notification reminder"
          >
            <X color={colors.textMuted} size={18} />
          </Pressable>
        </View>

        <Text style={styles.title}>Turn on push notifications</Text>
        <Text style={styles.description}>
          Get a buzz when someone cheers, comments, invites you, tags you as a drinking buddy, or posts an official Beerva update.
        </Text>

        <View style={styles.profileHint}>
          <View style={styles.profileHintIcon}>
            <UserCircle color={colors.primary} size={18} />
          </View>
          <Text style={styles.profileHintText}>You can also find the button on your Profile tab.</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={enableNow}
            disabled={busy}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Enable push notifications now"
          >
            {busy ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Enable now</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={showWhere}
            disabled={busy}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Show push notification button on profile"
          >
            <Text style={styles.secondaryButtonText}>Show me where</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.notNowButton}
          onPress={rememberAndClose}
          disabled={busy}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Do not show push notification reminder again"
        >
          <Text style={styles.notNowText}>Not now</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 94,
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
  profileHint: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileHintIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  profileHintText: {
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
    flex: 1,
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
    textAlign: 'center',
  },
  notNowButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notNowText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
});
