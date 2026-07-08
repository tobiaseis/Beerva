import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MapPin, Route, X } from 'lucide-react-native';

import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { CachedImage } from './CachedImage';
import {
  formatLiveMateCount,
  formatLiveStartedLabel,
  formatLiveTruePints,
  getLiveMateDisplayName,
  getLiveMatePubName,
  LiveMateSession,
} from '../lib/liveMateSessions';

type LiveMateSessionsSheetProps = {
  visible: boolean;
  sessions: LiveMateSession[];
  onPreviewSession: (session: LiveMateSession) => void;
  onClose: () => void;
};

export const LiveMateSessionsSheet = ({
  visible,
  sessions,
  onPreviewSession,
  onClose,
}: LiveMateSessionsSheetProps) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 150,
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-28, 0],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { opacity, transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Live mates</Text>
              <Text style={styles.subtitle}>{formatLiveMateCount(sessions.length)}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Close live mates"
            >
              <X color={colors.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {sessions.map((session) => {
              const displayName = getLiveMateDisplayName(session);
              const pubName = getLiveMatePubName(session);

              return (
                <TouchableOpacity
                  key={session.id}
                  style={styles.row}
                  onPress={() => onPreviewSession(session)}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel={`Preview ${displayName}'s live session photos`}
                  accessibilityHint="Opens photos uploaded to this active drinking session."
                >
                  <CachedImage
                    uri={session.avatarUrl}
                    fallbackUri={`https://i.pravatar.cc/150?u=${session.userId}`}
                    recyclingKey={`live-mate-${session.userId}-${session.avatarUrl || 'fallback'}`}
                    style={styles.avatar}
                    accessibilityLabel={`${displayName}'s avatar`}
                  />
                  <View style={styles.rowCopy}>
                    <View style={styles.nameLine}>
                      <Text style={styles.username} numberOfLines={1}>{displayName}</Text>
                      {session.isPubCrawl ? (
                        <View style={styles.crawlPill}>
                          <Route color={colors.primary} size={11} />
                          <Text style={styles.crawlPillText}>Pub crawl</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.pubLine}>
                      <MapPin color={colors.textMuted} size={13} />
                      <Text style={styles.pubName} numberOfLines={1}>{pubName}</Text>
                    </View>
                  </View>
                  <View style={styles.stats}>
                    <Text style={styles.truePints}>{formatLiveTruePints(session.truePints)}</Text>
                    <Text style={styles.elapsed}>{formatLiveStartedLabel(session.startedAt)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.58)',
  },
  sheet: {
    marginTop: 0,
    width: '100%',
    maxHeight: '78%',
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
    backgroundColor: colors.surfaceRaised,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.md,
    ...shadows.raised,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    ...typography.h2,
    fontSize: 22,
    lineHeight: 28,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: 4,
  },
  row: {
    minHeight: 74,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  username: {
    ...typography.body,
    color: colors.text,
    fontWeight: '900',
    flexShrink: 1,
    minWidth: 0,
  },
  crawlPill: {
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  crawlPillText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  pubLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  pubName: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    minWidth: 0,
  },
  stats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  truePints: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  elapsed: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
});
