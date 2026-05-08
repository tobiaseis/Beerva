import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Beer, CalendarDays, MapPin, UserCheck, UserPlus } from 'lucide-react-native';

import { ProfileStatsPanel } from '../components/ProfileStatsPanel';
import { calculateStats, emptyStats, getVolumeMl, ProfileSessionStatsRow, Stats } from '../lib/profileStats';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/dialogs';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const INVITE_MESSAGES = [
  '{name} has been beer-summoned. Hope they\'re thirsty.',
  'Beer signal activated! {name} has been alerted to the call of the pint.',
  '{name} has been summoned to the bar. May the foam be with you both.',
  'The brewski bat-signal is lit! {name} better answer.',
  '{name} has been pinged. If they ghost you, drink theirs too.',
  'Pigeon dispatched with a frothy demand. {name} is on notice.',
  '{name} is being paged from the tap. Stay hydrated (with hops).',
];

const INVITE_FAILURE_MESSAGES = [
  'The pigeon got drunk on the way. Try again.',
  'Beer signal jammed. The bartender will retry the call.',
  'Cosmic foam interference. Pour another and try again.',
];

type UserProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  updated_at?: string | null;
};

type PublicSession = ProfileSessionStatsRow & {
  id: string;
  pub_name: string | null;
  beer_name: string | null;
  volume: string | null;
  quantity: number | null;
  comment: string | null;
  image_url: string | null;
  created_at: string | null;
};

type FollowCounts = {
  followers: number;
  following: number;
};

const getDrinkLabel = (session: PublicSession) => {
  const volume = session.volume || 'Pint';
  const quantity = session.quantity || 1;

  return quantity > 1 ? `${quantity} x ${volume}` : volume;
};

const getTimeAgo = (dateString?: string | null) => {
  if (!dateString) return 'Recently';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.max(0, Math.round(diffMs / 60000));
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${Math.round(diffHours / 24)} days ago`;
};

const formatPints = (session: PublicSession) => {
  const volumeMl = getVolumeMl(session.volume);
  const quantity = session.quantity || 1;
  return Math.round((volumeMl * quantity / 568) * 10) / 10;
};

export const UserProfileScreen = ({ navigation, route }: any) => {
  const profileId = route?.params?.userId as string | undefined;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [sessions, setSessions] = useState<PublicSession[]>([]);
  const [followCounts, setFollowCounts] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async () => {
    if (!profileId) return;

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const [
        profileResult,
        sessionsResult,
        followersResult,
        followingResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, avatar_url, updated_at')
          .eq('id', profileId)
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('id, pub_name, beer_name, volume, quantity, abv, comment, image_url, created_at')
          .eq('user_id', profileId)
          .order('created_at', { ascending: false }),
        supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', profileId),
        supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', profileId),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      setProfile(profileResult.data as UserProfile | null);
      setSessions((sessionsResult.data || []) as PublicSession[]);
      setStats(calculateStats((sessionsResult.data || []) as PublicSession[]));
      setFollowCounts({
        followers: followersResult.count || 0,
        following: followingResult.count || 0,
      });

      if (user && user.id !== profileId) {
        const { data: followData, error: followError } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('following_id', profileId)
          .maybeSingle();

        if (followError) throw followError;
        setIsFollowing(Boolean(followData));

        if (followData) {
          const { data: mutualData } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('follower_id', profileId)
            .eq('following_id', user.id)
            .maybeSingle();
            
          setIsMutual(Boolean(mutualData));
        } else {
          setIsMutual(false);
        }
      } else {
        setIsFollowing(false);
        setIsMutual(false);
      }
    } catch (error) {
      console.error('User profile fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      fetchUserProfile();
    }, [fetchUserProfile])
  );

  const toggleFollow = async () => {
    if (!currentUserId || !profileId || currentUserId === profileId || followLoading) return;

    const previousFollowing = isFollowing;

    setFollowLoading(true);
    setIsFollowing(!previousFollowing);
    setFollowCounts((previous) => ({
      ...previous,
      followers: Math.max(0, previous.followers + (previousFollowing ? -1 : 1)),
    }));

    try {
      if (previousFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', profileId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: currentUserId,
            following_id: profileId,
          });

        if (error && error.code !== '23505') throw error;
      }
    } catch (error: any) {
      setIsFollowing(previousFollowing);
      setFollowCounts((previous) => ({
        ...previous,
        followers: Math.max(0, previous.followers + (previousFollowing ? 1 : -1)),
      }));
      Alert.alert('Could not update follow', error?.message || 'Please try again.');
    } finally {
      setFollowLoading(false);
    }
  };

  const inviteToDrink = async () => {
    if (!currentUserId || !profileId) return;

    try {
      const { error } = await supabase.from('notifications').insert({
        user_id: profileId,
        actor_id: currentUserId,
        type: 'invite',
      });

      if (error) throw error;

      const name = profile?.username || 'They';
      const template = INVITE_MESSAGES[Math.floor(Math.random() * INVITE_MESSAGES.length)];
      showAlert('🍻 Cheers Incoming!', template.replace('{name}', name));
    } catch (e: any) {
      console.error('Error sending invite', e);
      const fallback = INVITE_FAILURE_MESSAGES[Math.floor(Math.random() * INVITE_FAILURE_MESSAGES.length)];
      showAlert('🍺 Invite stuck in the keg', fallback);
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <ArrowLeft color={colors.text} size={22} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={typography.h2}>User not found</Text>
          <Text style={styles.emptyText}>This profile may no longer exist.</Text>
        </View>
      </View>
    );
  }

  const isOwnProfile = currentUserId === profile.id;
  const joinDate = profile.updated_at
    ? new Date(profile.updated_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';
  const recentSessions = sessions.slice(0, 5);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{profile.username || 'Beer Lover'}</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <View style={styles.header}>
        <Image
          source={{ uri: profile.avatar_url || `https://i.pravatar.cc/150?u=${profile.id}` }}
          style={styles.avatar}
        />
        <Text style={typography.h1}>{profile.username || 'Beer Lover'}</Text>
        <Text style={typography.bodyMuted}>Joined {joinDate}</Text>

        <View style={styles.followStats}>
          <View style={styles.followStat}>
            <Text style={styles.followStatValue}>{followCounts.followers}</Text>
            <Text style={styles.followStatLabel}>Followers</Text>
          </View>
          <View style={styles.followDivider} />
          <View style={styles.followStat}>
            <Text style={styles.followStatValue}>{followCounts.following}</Text>
            <Text style={styles.followStatLabel}>Following</Text>
          </View>
        </View>

        {isOwnProfile ? (
          <View style={styles.selfBadge}>
            <Text style={styles.selfBadgeText}>This is you</Text>
          </View>
        ) : (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.followButton, isFollowing ? styles.followingButton : null]}
              onPress={toggleFollow}
              disabled={followLoading}
              activeOpacity={0.75}
            >
              {isFollowing ? (
                <UserCheck color={colors.background} size={18} />
              ) : (
                <UserPlus color={colors.background} size={18} />
              )}
              <Text style={styles.followButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
            </TouchableOpacity>
            
            {isMutual && (
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={inviteToDrink}
                activeOpacity={0.75}
              >
                <Beer color={colors.background} size={18} />
                <Text style={styles.inviteButtonText}>Invite to drink</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <ProfileStatsPanel stats={stats} />

      <View style={styles.recentSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Beers</Text>
          <Text style={styles.sectionMeta}>{sessions.length}</Text>
        </View>

        {recentSessions.length === 0 ? (
          <View style={styles.recentEmpty}>
            <Beer color={colors.textMuted} size={28} />
            <Text style={styles.emptyText}>No sessions yet.</Text>
          </View>
        ) : (
          recentSessions.map((session) => (
            <View key={session.id} style={styles.sessionRow}>
              {session.image_url ? (
                <Image source={{ uri: session.image_url }} style={styles.sessionImage} />
              ) : (
                <View style={styles.sessionIcon}>
                  <Beer color={colors.primary} size={20} />
                </View>
              )}
              <View style={styles.sessionText}>
                <Text style={styles.sessionTitle}>{getDrinkLabel(session)} of {session.beer_name || 'Beer'}</Text>
                <View style={styles.sessionMetaRow}>
                  <MapPin color={colors.textMuted} size={13} />
                  <Text style={styles.sessionMetaText}>{session.pub_name || 'Unknown pub'}</Text>
                </View>
                <View style={styles.sessionMetaRow}>
                  <CalendarDays color={colors.textMuted} size={13} />
                  <Text style={styles.sessionMetaText}>{getTimeAgo(session.created_at)} · {formatPints(session)} true pints</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: Platform.OS === 'web' ? 24 : 32,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  topBar: {
    paddingTop: Platform.OS === 'web' ? 18 : 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  screenTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 22 : 28,
    paddingBottom: 22,
    paddingHorizontal: 16,
  },
  avatar: {
    width: Platform.OS === 'web' ? 104 : 120,
    height: Platform.OS === 'web' ? 104 : 120,
    borderRadius: Platform.OS === 'web' ? 52 : 60,
    borderWidth: 3,
    borderColor: colors.primary,
    marginBottom: 16,
  },
  followStats: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    marginTop: 18,
    marginBottom: 14,
    minWidth: 220,
  },
  followStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  followStatValue: {
    ...typography.h3,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  followStatLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  followDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  followButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  followingButton: {
    backgroundColor: colors.primaryDark,
  },
  followButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  inviteButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
    backgroundColor: '#10b981', // Emerald for distinct invite action
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
  selfBadge: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
  },
  selfBadgeText: {
    color: colors.textMuted,
    fontWeight: '700',
  },
  recentSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typography.h3,
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  sessionRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  sessionImage: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  sessionIcon: {
    width: 58,
    height: 58,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  sessionText: {
    flex: 1,
    minWidth: 0,
  },
  sessionTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  sessionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  sessionMetaText: {
    ...typography.caption,
    flex: 1,
  },
  recentEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 10,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
});
