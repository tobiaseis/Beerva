import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Beer, MapPin, MessageCircle, PartyPopper } from 'lucide-react-native';

import { CachedImage } from '../components/CachedImage';
import { EmptyIllustration } from '../components/EmptyIllustration';
import { useNotifications } from '../lib/notificationsContext';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type NotificationRow = {
  id: string;
  actor_id: string;
  type: 'cheer' | 'invite' | 'session_started' | 'comment';
  reference_id: string | null;
  read: boolean;
  created_at: string;
  profiles: {
    username: string | null;
    avatar_url: string | null;
  } | null;
};

const getTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.max(0, Math.round(diffMs / 60000));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${Math.round(diffHours / 24)} days ago`;
};

const getNotificationMessage = (item: NotificationRow) => {
  if (item.type === 'cheer') return ' cheered your session!';
  if (item.type === 'comment') return ' commented on your session.';
  if (item.type === 'session_started') return ' started a drinking session.';
  return ' invited you to drink!';
};

export const NotificationsScreen = ({ navigation }: any) => {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { markAllRead } = useNotifications();

  const fetchNotifications = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('id, actor_id, type, reference_id, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const baseRows = (data || []) as Array<Omit<NotificationRow, 'profiles'>>;
      const actorIds = Array.from(new Set(baseRows.map((n) => n.actor_id).filter(Boolean)));

      const profilesById = new Map<string, { username: string | null; avatar_url: string | null }>();
      if (actorIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', actorIds);

        if (profilesError) {
          console.error('Notification profiles fetch error', profilesError);
        } else {
          (profilesData || []).forEach((profile: any) => {
            profilesById.set(profile.id, { username: profile.username, avatar_url: profile.avatar_url });
          });
        }
      }

      const rows: NotificationRow[] = baseRows.map((notification) => ({
        ...notification,
        profiles: profilesById.get(notification.actor_id) || null,
      }));

      setNotifications(rows);

      const unreadIds = rows.filter((notification) => !notification.read).map((notification) => notification.id);
      if (unreadIds.length > 0) {
        markAllRead();
        supabase
          .from('notifications')
          .update({ read: true })
          .in('id', unreadIds)
          .then(({ error: updateError }) => {
            if (updateError) console.error('Error marking notifications as read', updateError);
          });
      }
    } catch (error) {
      console.error('Fetch notifications error', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [markAllRead]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications();
  }, [fetchNotifications]);

  const openProfile = useCallback((userId: string) => {
    navigation.navigate('UserProfile', { userId });
  }, [navigation]);

  const renderIcon = (type: NotificationRow['type']) => {
    if (type === 'cheer') return <Beer color={colors.primary} size={24} />;
    if (type === 'comment') return <MessageCircle color={colors.primary} size={24} />;
    if (type === 'session_started') return <MapPin color={colors.primary} size={24} />;
    return <PartyPopper color={colors.primary} size={24} />;
  };

  const renderItem = useCallback(({ item }: { item: NotificationRow }) => (
    <View style={[styles.card, !item.read && styles.unreadCard]}>
      <TouchableOpacity onPress={() => openProfile(item.actor_id)} style={styles.avatarContainer}>
        <CachedImage
          uri={item.profiles?.avatar_url}
          fallbackUri={`https://i.pravatar.cc/150?u=${item.actor_id}`}
          style={styles.avatar}
          recyclingKey={`notification-${item.actor_id}-${item.profiles?.avatar_url || 'fallback'}`}
          accessibilityLabel={`${item.profiles?.username || 'Someone'}'s avatar`}
        />
      </TouchableOpacity>
      <View style={styles.content}>
        <Text style={styles.message}>
          <Text style={styles.username}>{item.profiles?.username || 'Someone'}</Text>
          {getNotificationMessage(item)}
        </Text>
        <Text style={styles.time}>{getTimeAgo(item.created_at)}</Text>
      </View>
      <View style={styles.iconContainer}>
        {renderIcon(item.type)}
      </View>
    </View>
  ), [openProfile]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Notifications</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, notifications.length === 0 ? styles.emptyContent : null]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <EmptyIllustration kind="notifications" size={170} />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptyText}>When someone cheers your beer, invites you, or starts a session, you will see it here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingTop: Platform.OS === 'web' ? 18 : 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  backButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  screenTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    gap: spacing.md,
  },
  emptyContent: {
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    alignItems: 'center',
    ...shadows.card,
  },
  unreadCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  username: {
    fontWeight: '800',
    color: colors.text,
  },
  message: {
    ...typography.body,
    fontSize: 15,
  },
  time: {
    ...typography.caption,
    marginTop: 4,
  },
  iconContainer: {
    marginLeft: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 12,
  },
  emptyTitle: {
    ...typography.h3,
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
});
