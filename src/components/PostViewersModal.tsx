import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, RefreshCw, X } from 'lucide-react-native';
import { CachedImage } from './CachedImage';
import { fetchPostViewers, formatSeenAgo, PostViewer, PostViewTarget } from '../lib/postViews';
import { colors } from '../theme/colors';
import { radius, shadows } from '../theme/layout';
import { typography } from '../theme/typography';

type Props = {
  target: PostViewTarget | null;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
};

export const PostViewersModal = ({ target, onClose, onOpenProfile }: Props) => {
  const [viewers, setViewers] = useState<PostViewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!target) {
      setViewers([]);
      setErrorMessage(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchPostViewers(target)
      .then((rows) => {
        if (!cancelled) setViewers(rows);
      })
      .catch((error) => {
        console.error('Post viewers fetch error:', error);
        if (!cancelled) setErrorMessage('Couldn’t load viewers.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target, reloadToken]);

  const retry = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return (
    <Modal
      visible={Boolean(target)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Seen by</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close viewers"
            >
              <X color={colors.text} size={21} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : errorMessage ? (
            <View style={styles.centerState}>
              <Text style={styles.emptyText}>{errorMessage}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={retry} activeOpacity={0.75}>
                <RefreshCw color={colors.background} size={14} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={viewers}
              keyExtractor={(viewer) => viewer.userId}
              style={styles.list}
              contentContainerStyle={[
                styles.listContent,
                viewers.length === 0 ? styles.emptyContent : null,
              ]}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.personRow}
                  onPress={() => onOpenProfile(item.userId)}
                  activeOpacity={0.75}
                >
                  <CachedImage
                    uri={item.avatarUrl}
                    fallbackUri={`https://i.pravatar.cc/150?u=${item.userId}`}
                    style={styles.personAvatar}
                    recyclingKey={`viewer-${item.userId}-${item.avatarUrl || 'fallback'}`}
                    accessibilityLabel={`${item.username || 'Someone'}'s avatar`}
                  />
                  <View style={styles.personText}>
                    <Text style={styles.personName} numberOfLines={1}>{item.username || 'Someone'}</Text>
                    <Text style={styles.personMeta}>{formatSeenAgo(item.lastSeenAt)}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Eye color={colors.textMuted} size={28} />
                  <Text style={styles.emptyText}>No views yet.</Text>
                </View>
              }
            />
          )}

          <Text style={styles.privacyNote}>Only you can see who viewed your post.</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    ...shadows.raised,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.h3,
    fontSize: 18,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  centerState: {
    minHeight: 170,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyContent: {
    minHeight: 170,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  personRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  personMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  privacyNote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
});
