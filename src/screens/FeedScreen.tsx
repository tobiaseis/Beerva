import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Platform } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Beer, MapPin, Trash2, Users, Bell } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { confirmDestructive } from '../lib/dialogs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

const beervaLogo = require('../../assets/beerva-header-logo.png');

type SessionCheer = {
  session_id: string;
  user_id: string;
};

type FollowRow = {
  following_id: string;
};

type FeedSession = {
  id: string;
  user_id: string;
  pub_name: string;
  beer_name: string;
  volume: string | null;
  quantity: number | null;
  comment: string | null;
  image_url: string | null;
  created_at: string;
  profiles?: {
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  cheers_count: number;
  has_cheered: boolean;
};

const PULL_REFRESH_THRESHOLD = 65;
const PULL_MAX_DISTANCE = 110;
const FEED_PAGE_SIZE = 20;

const getDrinkLabel = (item: FeedSession) => {
  const volume = item.volume || 'Pint';
  const quantity = item.quantity || 1;

  return quantity > 1 ? `${quantity} x ${volume}` : volume;
};

const getCheersLabel = (count: number) => {
  return `${count} ${count === 1 ? 'Cheer' : 'Cheers'}`;
};

const getTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${Math.round(diffHours / 24)} days ago`;
};

export const FeedScreen = () => {
  const navigation = useNavigation<any>();
  const [sessions, setSessions] = useState<FeedSession[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followedUserCount, setFollowedUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cheeringSessionIds, setCheeringSessionIds] = useState<Set<string>>(() => new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const sessionsRef = useRef<FeedSession[]>([]);
  const hasMoreRef = useRef(true);
  const fetchingPageRef = useRef(false);
  const scrollOffsetY = useRef(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const fetchSessions = useCallback(async ({ reset = false }: { reset?: boolean } = {}) => {
    if (fetchingPageRef.current || (!reset && !hasMoreRef.current)) {
      return;
    }

    const offset = reset ? 0 : sessionsRef.current.length;
    fetchingPageRef.current = true;

    if (reset) {
      setLoading(sessionsRef.current.length === 0);
    } else {
      setLoadingMore(true);
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      if (!user) {
        setSessions([]);
        sessionsRef.current = [];
        setFollowedUserCount(0);
        setUnreadCount(0);
        setHasMore(false);
        hasMoreRef.current = false;
        return;
      }

      const [followsResult, unreadResult] = await Promise.all([
        supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id),
        reset
          ? supabase
              .from('notifications')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('read', false)
          : Promise.resolve({ count: null, error: null }),
      ]);

      const { data: followsData, error: followsError } = followsResult;

      if (followsError) {
        console.error('Feed follows fetch error:', followsError);
      }

      const followingIds = ((followsData || []) as FollowRow[]).map((follow) => follow.following_id);
      const feedUserIds = Array.from(new Set([user.id, ...followingIds]));
      setFollowedUserCount(followingIds.length);

      if (reset && !unreadResult.error) {
        setUnreadCount(unreadResult.count || 0);
      } else if (reset && unreadResult.error) {
        console.error('Unread notification count error:', unreadResult.error);
      }

      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          user_id,
          pub_name,
          beer_name,
          volume,
          quantity,
          comment,
          image_url,
          created_at,
          profiles (
            username,
            avatar_url
          )
        `)
        .in('user_id', feedUserIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + FEED_PAGE_SIZE);

      if (error) throw error;

      const rowsWithExtra = ((data || []) as any[]).map((session) => ({
        ...session,
        profiles: Array.isArray(session.profiles) ? session.profiles[0] || null : session.profiles,
      }));

      const hasNextPage = rowsWithExtra.length > FEED_PAGE_SIZE;
      const sessionRows = rowsWithExtra.slice(0, FEED_PAGE_SIZE);
      setHasMore(hasNextPage);
      hasMoreRef.current = hasNextPage;

      const sessionIds = sessionRows.map((session) => session.id);
      let cheers: SessionCheer[] = [];

      if (sessionIds.length > 0) {
        const { data: cheersData, error: cheersError } = await supabase
          .from('session_cheers')
          .select('session_id, user_id')
          .in('session_id', sessionIds);

        if (cheersError) {
          console.error('Cheers fetch error:', cheersError);
        } else {
          cheers = cheersData || [];
        }
      }

      const cheersBySession = cheers.reduce((acc, cheer) => {
        const existing = acc.get(cheer.session_id) || [];
        existing.push(cheer);
        acc.set(cheer.session_id, existing);
        return acc;
      }, new Map<string, SessionCheer[]>());

      const pageSessions = sessionRows.map((session) => {
        const sessionCheers = cheersBySession.get(session.id) || [];

        return {
          ...session,
          cheers_count: sessionCheers.length,
          has_cheered: user ? sessionCheers.some((cheer) => cheer.user_id === user.id) : false,
        };
      });

      setSessions((previous) => {
        const nextSessions = reset ? pageSessions : [...previous, ...pageSessions];
        sessionsRef.current = nextSessions;
        return nextSessions;
      });
    } catch (error) {
      console.error('Feed fetch error:', error);
    } finally {
      fetchingPageRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSessions({ reset: true });
    }, [fetchSessions])
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const previous = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = 'contain';
    return () => {
      document.body.style.overscrollBehaviorY = previous;
    };
  }, []);

  const handleScroll = (e: any) => {
    scrollOffsetY.current = e.nativeEvent.contentOffset.y;
  };

  const handleTouchStart = (e: any) => {
    if (Platform.OS !== 'web' || refreshing || fetchingPageRef.current) return;
    if (scrollOffsetY.current > 0) {
      isPulling.current = false;
      return;
    }
    const touch = e.nativeEvent.touches?.[0];
    if (!touch) return;
    touchStartY.current = touch.pageY;
    isPulling.current = true;
  };

  const handleTouchMove = (e: any) => {
    if (Platform.OS !== 'web' || !isPulling.current || refreshing) return;
    if (scrollOffsetY.current > 0) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }
    const touch = e.nativeEvent.touches?.[0];
    if (!touch) return;
    const delta = touch.pageY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.55, PULL_MAX_DISTANCE));
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (Platform.OS !== 'web' || !isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= PULL_REFRESH_THRESHOLD && !refreshing && !fetchingPageRef.current) {
      setRefreshing(true);
      fetchSessions({ reset: true });
    }
    setPullDistance(0);
  };

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`notifications-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const onRefresh = useCallback(() => {
    if (fetchingPageRef.current) return;
    setRefreshing(true);
    fetchSessions({ reset: true });
  }, [fetchSessions]);

  const loadMoreSessions = useCallback(() => {
    fetchSessions({ reset: false });
  }, [fetchSessions]);

  const openProfile = useCallback((userId: string) => {
    if (userId === currentUserId) {
      navigation.navigate('Profile');
      return;
    }

    const parentNavigation = navigation.getParent?.();
    (parentNavigation || navigation).navigate('UserProfile', { userId });
  }, [currentUserId, navigation]);

  const openPeople = useCallback(() => {
    navigation.navigate('People');
  }, [navigation]);

  const toggleCheers = useCallback(async (item: FeedSession) => {
    if (!currentUserId || item.user_id === currentUserId || cheeringSessionIds.has(item.id)) {
      return;
    }

    const nextHasCheered = !item.has_cheered;
    const previousHasCheered = item.has_cheered;
    const previousCheersCount = item.cheers_count;

    setCheeringSessionIds((previous) => {
      const next = new Set(previous);
      next.add(item.id);
      return next;
    });

    setSessions((previous) => {
      const nextSessions = previous.map((session) => {
        if (session.id !== item.id) return session;

        return {
          ...session,
          has_cheered: nextHasCheered,
          cheers_count: Math.max(0, previousCheersCount + (nextHasCheered ? 1 : -1)),
        };
      });
      sessionsRef.current = nextSessions;
      return nextSessions;
    });

    try {
      if (nextHasCheered) {
        const { error } = await supabase
          .from('session_cheers')
          .insert({
            session_id: item.id,
            user_id: currentUserId,
          });

        if (error && error.code !== '23505') throw error;

        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: item.user_id,
          actor_id: currentUserId,
          type: 'cheer',
          reference_id: item.id,
        });
        if (notifError) console.error('Cheer notification insert error:', notifError);
      } else {
        const { error } = await supabase
          .from('session_cheers')
          .delete()
          .eq('session_id', item.id)
          .eq('user_id', currentUserId);

        if (error) throw error;

        await supabase.from('notifications')
          .delete()
          .eq('user_id', item.user_id)
          .eq('actor_id', currentUserId)
          .eq('type', 'cheer')
          .eq('reference_id', item.id);
      }
    } catch (error: any) {
      setSessions((previous) => {
        const nextSessions = previous.map((session) => (
          session.id === item.id
            ? {
                ...session,
                has_cheered: previousHasCheered,
                cheers_count: previousCheersCount,
              }
            : session
        ));
        sessionsRef.current = nextSessions;
        return nextSessions;
      });
      Alert.alert('Could not update cheers', error?.message || 'Please try again.');
    } finally {
      setCheeringSessionIds((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
    }
  }, [cheeringSessionIds, currentUserId]);

  const deleteSession = useCallback((sessionId: string) => {
    if (!currentUserId) return;

    confirmDestructive('Delete Post', 'Remove this beer session from your feed?', 'Delete', async () => {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', currentUserId);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setSessions((previous) => {
        const nextSessions = previous.filter((session) => session.id !== sessionId);
        sessionsRef.current = nextSessions;
        return nextSessions;
      });
    });
  }, [currentUserId]);

  const renderFeedHeader = useCallback(() => {
    if (Platform.OS !== 'web' || (!pullDistance && !refreshing)) {
      return null;
    }

    return (
      <View style={[styles.pullIndicator, { height: refreshing ? 56 : pullDistance }]}>
        {refreshing ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.pullText}>
            {pullDistance >= PULL_REFRESH_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </Text>
        )}
      </View>
    );
  }, [pullDistance, refreshing]);

  const renderEmptyFeed = useCallback(() => (
    <View style={styles.emptyState}>
      <Users color={colors.textMuted} size={34} />
      <Text style={styles.emptyTitle}>
        {followedUserCount === 0 ? 'Build your beer crew' : 'Quiet feed'}
      </Text>
      <Text style={styles.emptyText}>
        {followedUserCount === 0
          ? 'Follow friends to see their sessions here alongside your own.'
          : 'No one in your feed has posted a session yet.'}
      </Text>
      {followedUserCount === 0 ? (
        <TouchableOpacity style={styles.emptyButton} onPress={openPeople} activeOpacity={0.75}>
          <Text style={styles.emptyButtonText}>Find People</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ), [followedUserCount, openPeople]);

  const renderFeedFooter = useCallback(() => {
    if (!loadingMore) return null;

    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }, [loadingMore]);

  const renderSession = useCallback(({ item }: { item: FeedSession }) => {
    const isOwnPost = item.user_id === currentUserId;
    const isCheering = cheeringSessionIds.has(item.id);
    const cheersColor = item.has_cheered ? colors.primary : colors.textMuted;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.profileLink}
            onPress={() => openProfile(item.user_id)}
            activeOpacity={0.75}
          >
            <Image source={{ uri: item.profiles?.avatar_url || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{item.profiles?.username || 'Unknown'}</Text>
              <Text style={styles.timeText}>{getTimeAgo(item.created_at)}</Text>
            </View>
          </TouchableOpacity>
          {isOwnPost ? (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => deleteSession(item.id)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Trash2 color={colors.danger} size={18} />
            </TouchableOpacity>
          ) : null}
        </View>

        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.feedImage} />
        ) : null}

        <View style={styles.cardContent}>
          <View style={styles.row}>
            <MapPin color={colors.primary} size={16} />
            <Text style={styles.locationText}> Drinking at <Text style={styles.bold}>{item.pub_name}</Text></Text>
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            <Beer color={colors.primary} size={16} />
            <Text style={styles.beerText}> {getDrinkLabel(item)} of <Text style={styles.bold}>{item.beer_name}</Text></Text>
          </View>
          {item.comment ? (
            <View style={styles.commentBlock}>
              <Text style={styles.commentText}>{item.comment}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              item.has_cheered ? styles.actionBtnActive : null,
              isOwnPost ? styles.actionBtnDisabled : null,
            ]}
            onPress={() => toggleCheers(item)}
            disabled={isOwnPost || isCheering || !currentUserId}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={`Give cheers to ${item.profiles?.username || 'this post'}`}
            accessibilityState={{ disabled: isOwnPost || isCheering || !currentUserId, selected: item.has_cheered }}
          >
            <Beer color={cheersColor} fill={item.has_cheered ? 'rgba(245, 158, 11, 0.2)' : 'transparent'} size={20} />
            <Text style={[styles.actionText, item.has_cheered ? styles.actionTextActive : null]}>
              {getCheersLabel(item.cheers_count)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [cheeringSessionIds, currentUserId, deleteSession, openProfile, toggleCheers]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image source={beervaLogo} style={styles.logoImage} />
          <Text style={styles.logoText}>Beerva</Text>
        </View>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Bell color={colors.text} size={24} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          contentContainerStyle={[
            styles.scrollContent,
            sessions.length === 0 ? styles.emptyContent : null,
          ]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          refreshControl={
            Platform.OS !== 'web'
              ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              : undefined
          }
          onEndReached={loadMoreSessions}
          onEndReachedThreshold={0.45}
          ListHeaderComponent={renderFeedHeader}
          ListEmptyComponent={renderEmptyFeed}
          ListFooterComponent={renderFeedFooter}
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
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 18 : 60,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'web' ? 14 : 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bellButton: {
    padding: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  badgeText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 3,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 44,
    height: 42,
    marginRight: 12,
    resizeMode: 'contain',
  },
  logoText: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 28,
    color: colors.primary,
  },
  scrollContent: {
    padding: Platform.OS === 'web' ? 14 : 16,
    paddingBottom: Platform.OS === 'web' ? 24 : 16,
  },
  emptyContent: {
    flexGrow: 1,
  },
  pullIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 6,
  },
  pullText: {
    ...typography.bodyMuted,
    fontWeight: '700',
    color: colors.primary,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  profileLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  userName: {
    ...typography.h3,
    fontSize: 16,
  },
  timeText: {
    ...typography.caption,
  },
  feedImage: {
    width: '100%',
    height: Platform.OS === 'web' ? 220 : 250,
  },
  cardContent: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    ...typography.body,
    color: colors.text,
  },
  beerText: {
    ...typography.body,
    color: colors.text,
  },
  commentBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: colors.primary,
  },
  cardFooter: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.32)',
  },
  actionBtnDisabled: {
    opacity: 0.62,
  },
  actionText: {
    ...typography.bodyMuted,
    marginLeft: 8,
    fontWeight: '600',
  },
  actionTextActive: {
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 64,
    gap: 10,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: 8,
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 15,
  },
});
