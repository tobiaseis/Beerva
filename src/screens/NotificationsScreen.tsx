import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Beer, Check, MapPin, MessageCircle, PartyPopper, XCircle } from 'lucide-react-native';

import { CachedImage } from '../components/CachedImage';
import { EmptyIllustration } from '../components/EmptyIllustration';
import { getNotificationMessage, NotificationMetadata } from '../lib/notificationMessages';
import { useNotifications } from '../lib/notificationsContext';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type NotificationType = 'cheer' | 'invite' | 'session_started' | 'comment' | 'invite_response' | 'pub_crawl_started';
type InviteStatus = 'pending' | 'accepted' | 'declined';

type ProfilePreview = {
  username: string | null;
  avatar_url: string | null;
};

type SessionPreview = {
  pub_name: string | null;
};

type DrinkingInvite = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: InviteStatus;
  created_at: string;
  responded_at: string | null;
};

type NotificationRow = {
  id: string;
  actor_id: string;
  type: NotificationType;
  reference_id: string | null;
  metadata: NotificationMetadata | null;
  read: boolean;
  created_at: string;
  profiles: ProfilePreview | null;
  session: SessionPreview | null;
  invite: DrinkingInvite | null;
};

type NotificationBaseRow = Omit<NotificationRow, 'profiles' | 'session' | 'invite'>;

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

const getInviteStatusText = (status: InviteStatus) => {
  if (status === 'accepted') return "You're going";
  if (status === 'declined') return "You can't make it";
  return 'Waiting for your reply';
};

export const NotificationsScreen = ({ navigation }: any) => {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingInviteIds, setRespondingInviteIds] = useState<Set<string>>(() => new Set());
  const { markAllRead } = useNotifications();

  const fetchNotifications = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCurrentUserId(null);
        setNotifications([]);
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('notifications')
        .select('id, actor_id, type, reference_id, metadata, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const baseRows = (data || []) as NotificationBaseRow[];
      const actorIds = Array.from(new Set(baseRows.map((n) => n.actor_id).filter(Boolean)));
      const sessionIds = Array.from(new Set(
        baseRows
          .filter((n) => n.type === 'session_started' && n.reference_id)
          .map((n) => n.reference_id as string)
      ));
      const crawlIds = Array.from(new Set(
        baseRows
          .filter((n) => n.type === 'pub_crawl_started' && n.reference_id)
          .map((n) => n.reference_id as string)
      ));
      const inviteIds = Array.from(new Set(
        baseRows
          .filter((n) => (n.type === 'invite' || n.type === 'invite_response') && n.reference_id)
          .map((n) => n.reference_id as string)
      ));

      const [profilesResult, sessionsResult, crawlsResult, invitesResult] = await Promise.all([
        actorIds.length > 0
          ? supabase.from('profiles').select('id, username, avatar_url').in('id', actorIds)
          : Promise.resolve({ data: [], error: null }),
        sessionIds.length > 0
          ? supabase.from('sessions').select('id, pub_name').in('id', sessionIds)
          : Promise.resolve({ data: [], error: null }),
        crawlIds.length > 0
          ? supabase.from('sessions').select('pub_crawl_id, pub_name').in('pub_crawl_id', crawlIds).eq('crawl_stop_order', 1)
          : Promise.resolve({ data: [], error: null }),
        inviteIds.length > 0
          ? supabase.from('drinking_invites').select('id, sender_id, recipient_id, status, created_at, responded_at').in('id', inviteIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const profilesById = new Map<string, ProfilePreview>();
      if (profilesResult.error) {
        console.error('Notification profiles fetch error', profilesResult.error);
      } else {
        (profilesResult.data || []).forEach((profile: any) => {
          profilesById.set(profile.id, { username: profile.username, avatar_url: profile.avatar_url });
        });
      }

      const sessionsById = new Map<string, SessionPreview>();
      if (sessionsResult.error) {
        console.error('Notification sessions fetch error', sessionsResult.error);
      } else {
        (sessionsResult.data || []).forEach((session: any) => {
          sessionsById.set(session.id, { pub_name: session.pub_name });
        });
      }

      if (crawlsResult.error) {
        console.error('Notification crawls fetch error', crawlsResult.error);
      } else {
        (crawlsResult.data || []).forEach((session: any) => {
          sessionsById.set(session.pub_crawl_id, { pub_name: session.pub_name });
        });
      }

      const invitesById = new Map<string, DrinkingInvite>();
      if (invitesResult.error) {
        console.error('Notification invites fetch error', invitesResult.error);
      } else {
        ((invitesResult.data || []) as DrinkingInvite[]).forEach((invite) => {
          invitesById.set(invite.id, invite);
        });
      }

      const rows: NotificationRow[] = baseRows.map((notification) => ({
        ...notification,
        profiles: profilesById.get(notification.actor_id) || null,
        session: notification.reference_id ? sessionsById.get(notification.reference_id) || null : null,
        invite: notification.reference_id ? invitesById.get(notification.reference_id) || null : null,
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

  const respondToInvite = useCallback(async (item: NotificationRow, status: Exclude<InviteStatus, 'pending'>) => {
    const inviteId = item.invite?.id || item.reference_id;
    if (!currentUserId || !inviteId || item.invite?.status !== 'pending') return;

    setRespondingInviteIds((previous) => new Set(previous).add(inviteId));
    try {
      const { data: updatedInvite, error } = await supabase.rpc('respond_to_drinking_invite', {
        target_invite_id: inviteId,
        response_status: status,
      });

      if (error) throw error;
      if (!updatedInvite) throw new Error('This invite has already been answered.');

      const invite = updatedInvite as DrinkingInvite;
      setNotifications((previous) => previous.map((notification) => (
        notification.reference_id === invite.id
          ? { ...notification, invite }
          : notification
      )));

    } catch (error: any) {
      Alert.alert('Could not answer invite', error?.message || 'Please try again.');
    } finally {
      setRespondingInviteIds((previous) => {
        const next = new Set(previous);
        next.delete(inviteId);
        return next;
      });
    }
  }, [currentUserId]);

  const renderIcon = (item: NotificationRow) => {
    if (item.type === 'cheer') return <Beer color={colors.primary} size={24} />;
    if (item.type === 'comment') return <MessageCircle color={colors.primary} size={24} />;
    if (item.type === 'session_started') return <MapPin color={colors.primary} size={24} />;
    if (item.type === 'invite_response' && item.invite?.status === 'accepted') {
      return <Check color={colors.success} size={24} />;
    }
    if (item.type === 'invite_response' && item.invite?.status === 'declined') {
      return <XCircle color={colors.danger} size={24} />;
    }
    return <PartyPopper color={colors.primary} size={24} />;
  };

  const renderItem = useCallback(({ item }: { item: NotificationRow }) => {
    const canRespond = item.type === 'invite'
      && item.invite?.status === 'pending'
      && item.invite.recipient_id === currentUserId;
    const responding = Boolean(item.invite?.id && respondingInviteIds.has(item.invite.id));
    const answeredInvite = item.type === 'invite' && item.invite?.status !== 'pending' ? item.invite : null;

    return (
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

          {canRespond ? (
            <View style={styles.inviteActions}>
              <TouchableOpacity
                style={[styles.inviteActionButton, styles.acceptButton]}
                onPress={() => respondToInvite(item, 'accepted')}
                disabled={responding}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ disabled: responding }}
              >
                {responding ? <ActivityIndicator color={colors.background} size="small" /> : <Check color={colors.background} size={16} />}
                <Text style={styles.inviteActionText}>I'll be there</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteActionButton, styles.declineButton]}
                onPress={() => respondToInvite(item, 'declined')}
                disabled={responding}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ disabled: responding }}
              >
                <XCircle color={colors.text} size={16} />
                <Text style={[styles.inviteActionText, styles.declineActionText]}>Yeah, nah, I can't</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {answeredInvite ? (
            <Text style={[
              styles.inviteStatusText,
              answeredInvite.status === 'accepted' ? styles.acceptedStatusText : styles.declinedStatusText,
            ]}>
              {getInviteStatusText(answeredInvite.status)}
            </Text>
          ) : null}

          {item.type === 'invite' && item.reference_id && !item.invite ? (
            <Text style={styles.unavailableText}>This invite is no longer available.</Text>
          ) : null}
        </View>
        <View style={styles.iconContainer}>
          {renderIcon(item)}
        </View>
      </View>
    );
  }, [currentUserId, openProfile, respondToInvite, respondingInviteIds]);

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
          extraData={respondingInviteIds}
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
    minWidth: 0,
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
  inviteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  inviteActionButton: {
    minHeight: 40,
    minWidth: 126,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  acceptButton: {
    backgroundColor: colors.success,
  },
  declineButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  inviteActionText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '800',
  },
  declineActionText: {
    color: colors.text,
  },
  inviteStatusText: {
    ...typography.caption,
    marginTop: 8,
    fontWeight: '800',
  },
  acceptedStatusText: {
    color: colors.success,
  },
  declinedStatusText: {
    color: colors.textMuted,
  },
  unavailableText: {
    ...typography.caption,
    marginTop: 8,
    color: colors.textMuted,
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
