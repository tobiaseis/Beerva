import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Platform, FlatList } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Bell, BellOff, Camera, Edit2, LogOut, Users, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { confirmDestructive, showAlert } from '../lib/dialogs';
import { deletePublicImageUrl, prepareWebImageFromPickerAsset, SelectedImage, UPLOAD_IMAGE_MAX_WIDTH, uploadImageToBucket } from '../lib/imageUpload';
import { ProfileStatsPanel } from '../components/ProfileStatsPanel';
import { emptyStats, Stats } from '../lib/profileStats';
import { fetchPintTimeline, fetchProfileStats, PintTimelinePoint } from '../lib/profileStatsApi';
import { CachedImage } from '../components/CachedImage';
import { getUsernameSaveErrorMessage, normalizeUsername } from '../lib/usernames';
import { AppButton } from '../components/AppButton';
import { radius, spacing } from '../theme/layout';
import { SkeletonProfile } from '../components/Skeleton';
import { useFocused } from '../lib/useFocused';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermissionStatus,
  getPushSupportInfo,
  isCurrentlySubscribed,
} from '../lib/pushNotifications';
import * as ImagePicker from 'expo-image-picker';

type FollowListKind = 'followers' | 'following';

type ProfilePreview = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export const ProfileScreen = () => {
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [pintTimeline, setPintTimeline] = useState<PintTimelinePoint[]>([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followModalKind, setFollowModalKind] = useState<FollowListKind | null>(null);
  const [followUsers, setFollowUsers] = useState<ProfilePreview[]>([]);
  const [followUsersLoading, setFollowUsersLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const usernameFocus = useFocused();
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [editAvatar, setEditAvatar] = useState<SelectedImage | null>(null);
  const [saving, setSaving] = useState(false);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushUnsupportedReason, setPushUnsupportedReason] = useState<string | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPushState = useCallback(async () => {
    const support = getPushSupportInfo();
    setPushSupported(support.supported);
    setPushUnsupportedReason(support.supported ? null : support.reason || null);
    if (!support.supported) {
      setPushSubscribed(false);
      return;
    }
    setPushSubscribed(await isCurrentlySubscribed());
  }, []);

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        await disablePushNotifications();
        setPushSubscribed(false);
        showAlert('Push notifications off', 'You will no longer get push alerts on this device.');
      } else {
        const result = await enablePushNotifications();
        if (result.ok) {
          setPushSubscribed(true);
          showAlert('🍻 Push notifications on', 'We\'ll buzz you when someone cheers or invites you.');
        } else {
          const status = getPushPermissionStatus();
          if (status === 'denied') {
            showAlert(
              'Notifications blocked',
              'Your browser is blocking notifications for Beerva. Re-enable them in your browser settings, then try again.'
            );
          } else {
            showAlert('Could not enable push', result.reason || 'Please try again.');
          }
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fallbackProfile = {
        id: user.id,
        username: user.user_metadata?.username || user.email?.split('@')[0] || 'beer_lover',
        avatar_url: user.user_metadata?.avatar_url || 'https://i.pravatar.cc/150?u=' + user.id,
        updated_at: user.created_at || new Date().toISOString(),
      };

      const [
        profileResult,
        profileStats,
        timeline,
        followersResult,
        followingResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle(),
        fetchProfileStats(user.id),
        fetchPintTimeline(user.id),
        supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', user.id),
        supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', user.id),
      ]);

      const { data: profileData, error: profileError } = profileResult;
      
      if (profileError) {
        console.error(profileError);
      }

      const currentProfile = profileData || fallbackProfile;
      setProfile(currentProfile);
      setEditUsername(currentProfile.username || '');
      setEditAvatarUri(currentProfile.avatar_url);
      setEditAvatar(null);
      setStats(profileStats);
      setPintTimeline(timeline);
      setFollowCounts({
        followers: followersResult.count || 0,
        following: followingResult.count || 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      refreshPushState();
    }, [refreshPushState])
  );

  const handleLogout = async () => {
    confirmDestructive('Log Out', 'Are you sure you want to log out?', 'Log Out', () => {
      supabase.auth.signOut();
    });
  };

  const openFollowModal = async (kind: FollowListKind) => {
    if (!profile?.id) return;

    setFollowModalKind(kind);
    setFollowUsers([]);
    setFollowUsersLoading(true);

    try {
      const idColumn = kind === 'followers' ? 'follower_id' : 'following_id';
      const filterColumn = kind === 'followers' ? 'following_id' : 'follower_id';

      const { data, error } = await supabase
        .from('follows')
        .select(idColumn)
        .eq(filterColumn, profile.id)
        .limit(100);

      if (error) throw error;

      const ids = Array.from(new Set((data || []).map((row: any) => row[idColumn]).filter(Boolean)));
      if (ids.length === 0) {
        setFollowUsers([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', ids);

      if (profilesError) throw profilesError;

      const profilesById = new Map((profiles || []).map((item: any) => [item.id, item as ProfilePreview]));
      setFollowUsers(ids.map((id) => profilesById.get(id)).filter(Boolean) as ProfilePreview[]);
    } catch (error) {
      console.error('Follow list fetch error:', error);
      showAlert('Could not load people', 'Please try again.');
    } finally {
      setFollowUsersLoading(false);
    }
  };

  const closeFollowModal = () => {
    setFollowModalKind(null);
    setFollowUsers([]);
  };

  const openUserProfile = (userId: string) => {
    closeFollowModal();
    if (userId === profile?.id) return;
    navigation.navigate('UserProfile', { userId });
  };

  const pickAvatar = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const asset = result.assets[0];

      if (Platform.OS === 'web') {
        const image = await prepareWebImageFromPickerAsset(asset);
        setEditAvatarUri(image.uri);
        setEditAvatar(image);
        return;
      }

      const ImageManipulator = await import('expo-image-manipulator');
      const manipResult = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: UPLOAD_IMAGE_MAX_WIDTH, height: UPLOAD_IMAGE_MAX_WIDTH } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      const image = {
        uri: manipResult.uri,
        mimeType: 'image/jpeg',
      };
      setEditAvatarUri(image.uri);
      setEditAvatar(image);
    }
  };

  const saveProfile = async () => {
    const username = normalizeUsername(editUsername);

    if (!username) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      let avatarUrl = editAvatarUri;
      const previousAvatarUrl = profile?.avatar_url;
      if (editAvatar) {
        avatarUrl = await uploadImageToBucket('session_images', editAvatar, `users/${user.id}/avatars`);
      }

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        username,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      if (error) throw error;

      const { error: userError } = await supabase.auth.updateUser({
        data: {
          username,
          avatar_url: avatarUrl,
        },
      });

      if (userError) {
        console.error(userError);
      }

      if (editAvatar && previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
        deletePublicImageUrl('session_images', previousAvatarUrl);
      }

      await fetchProfile();
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert('Could not save profile', getUsernameSaveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonProfile />
      </View>
    );
  }

  const joinDate = profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently';

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <CachedImage
            uri={profile?.avatar_url}
            fallbackUri={'https://i.pravatar.cc/150?u=' + profile?.id}
            style={styles.avatar}
            recyclingKey={`profile-${profile?.id}-${profile?.avatar_url || 'fallback'}`}
            accessibilityLabel={`${profile?.username || 'Beer Lover'}'s avatar`}
          />
          <TouchableOpacity style={styles.editBadge} onPress={() => setIsEditing(true)}>
            <Edit2 color={colors.background} size={16} />
          </TouchableOpacity>
        </View>
        <Text style={typography.h1}>{profile?.username || 'Beer Lover'}</Text>
        <Text style={typography.bodyMuted}>Joined {joinDate}</Text>
        <View style={styles.followStats}>
          <TouchableOpacity
            style={styles.followStat}
            onPress={() => openFollowModal('followers')}
            activeOpacity={0.76}
            accessibilityRole="button"
            accessibilityLabel="Show followers"
          >
            <Text style={styles.followStatValue}>{followCounts.followers}</Text>
            <Text style={styles.followStatLabel}>Followers</Text>
          </TouchableOpacity>
          <View style={styles.followDivider} />
          <TouchableOpacity
            style={styles.followStat}
            onPress={() => openFollowModal('following')}
            activeOpacity={0.76}
            accessibilityRole="button"
            accessibilityLabel="Show following"
          >
            <Text style={styles.followStatValue}>{followCounts.following}</Text>
            <Text style={styles.followStatLabel}>Following</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ProfileStatsPanel stats={stats} pintTimeline={pintTimeline} />

      {pushSupported ? (
        <TouchableOpacity
          style={[styles.pushButton, pushSubscribed ? styles.pushButtonOn : styles.pushButtonOff]}
          onPress={togglePush}
          disabled={pushBusy}
          activeOpacity={0.75}
        >
          {pushSubscribed ? (
            <Bell color={colors.primary} size={20} />
          ) : (
            <BellOff color={colors.textMuted} size={20} />
          )}
          <Text style={[styles.pushButtonText, pushSubscribed ? styles.pushButtonTextOn : null]}>
            {pushBusy
              ? 'Working…'
              : pushSubscribed
                ? 'Push notifications enabled'
            : 'Enable push notifications'}
          </Text>
        </TouchableOpacity>
      ) : pushUnsupportedReason ? (
        <View style={styles.pushHint}>
          <BellOff color={colors.textMuted} size={18} />
          <Text style={styles.pushHintText}>{pushUnsupportedReason}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <LogOut color={colors.danger} size={20} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Modal visible={isEditing} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={typography.h2}>Edit Profile</Text>
            <TouchableOpacity onPress={() => setIsEditing(false)}>
              <X color={colors.text} size={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.editAvatarButton} onPress={pickAvatar}>
              {editAvatarUri ? (
                <Image source={{ uri: editAvatarUri }} style={styles.editAvatarImage} />
              ) : (
                <Camera color={colors.primary} size={32} />
              )}
              <View style={styles.editAvatarOverlay}>
                <Text style={styles.editAvatarText}>Change</Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Username</Text>
            <TextInput
              style={[styles.input, usernameFocus.focused ? styles.inputFocused : null]}
              value={editUsername}
              onChangeText={setEditUsername}
              placeholder="BeerLover99"
              placeholderTextColor={colors.textMuted}
              onFocus={usernameFocus.onFocus}
              onBlur={usernameFocus.onBlur}
            />

            <AppButton label="Save Changes" onPress={saveProfile} loading={saving} />
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(followModalKind)}
        transparent
        animationType="fade"
        onRequestClose={closeFollowModal}
      >
        <View style={styles.followModalBackdrop}>
          <View style={styles.followModalSheet}>
            <View style={styles.followModalHeader}>
              <View>
                <Text style={styles.followModalTitle}>
                  {followModalKind === 'followers' ? 'Followers' : 'Following'}
                </Text>
                <Text style={styles.followModalMeta}>
                  {followModalKind === 'followers' ? followCounts.followers : followCounts.following}
                </Text>
              </View>
              <TouchableOpacity style={styles.followModalClose} onPress={closeFollowModal}>
                <X color={colors.text} size={20} />
              </TouchableOpacity>
            </View>

            {followUsersLoading ? (
              <View style={styles.followModalLoader}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : (
              <FlatList
                data={followUsers}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                  styles.followListContent,
                  followUsers.length === 0 ? styles.followListEmptyContent : null,
                ]}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.followUserRow}
                    onPress={() => openUserProfile(item.id)}
                    activeOpacity={0.75}
                  >
                    <CachedImage
                      uri={item.avatar_url}
                      fallbackUri={`https://i.pravatar.cc/150?u=${item.id}`}
                      style={styles.followUserAvatar}
                      recyclingKey={`follow-${item.id}-${item.avatar_url || 'fallback'}`}
                      accessibilityLabel={`${item.username || 'Beer Lover'}'s avatar`}
                    />
                    <Text style={styles.followUserName}>{item.username || 'Beer Lover'}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.followEmptyState}>
                    <Users color={colors.textMuted} size={28} />
                    <Text style={styles.followEmptyText}>
                      {followModalKind === 'followers'
                        ? 'No followers yet.'
                        : 'Not following anyone yet.'}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 22 : 60,
    paddingBottom: Platform.OS === 'web' ? 22 : 30,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: Platform.OS === 'web' ? 104 : 120,
    height: Platform.OS === 'web' ? 104 : 120,
    borderRadius: Platform.OS === 'web' ? 52 : 60,
    borderWidth: 3,
    borderColor: colors.primaryBorder,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  followStats: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    marginTop: 18,
    minWidth: 230,
    overflow: 'hidden',
  },
  followStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
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
    backgroundColor: colors.borderSoft,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: Platform.OS === 'web' ? 16 : 20,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 4,
    textAlign: 'center',
  },
  highScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: Platform.OS === 'web' ? 16 : 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  highScoreLabel: {
    ...typography.h3,
    color: colors.text,
    fontSize: 18,
  },
  highScoreHint: {
    ...typography.caption,
    marginTop: 4,
  },
  highScoreValue: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 36,
    color: colors.primary,
    marginLeft: 16,
  },
  section: {
    padding: Platform.OS === 'web' ? 16 : 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    ...typography.h3,
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badge: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 104,
    minHeight: Platform.OS === 'web' ? 146 : 154,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  badgeEarned: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  badgeLocked: {
    backgroundColor: 'rgba(30, 41, 59, 0.45)',
    borderColor: 'rgba(148, 163, 184, 0.16)',
  },
  badgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  badgeIconEarned: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  badgeIconLocked: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  badgeText: {
    ...typography.caption,
    textAlign: 'center',
    fontWeight: '700',
    minHeight: 34,
  },
  badgeTextEarned: {
    color: colors.text,
  },
  badgeTextLocked: {
    color: colors.textMuted,
  },
  badgeDescription: {
    ...typography.caption,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  pushButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  pushButtonOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  pushButtonOff: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
  },
  pushButtonText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textMuted,
  },
  pushButtonTextOn: {
    color: colors.primary,
  },
  pushHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    gap: 10,
  },
  pushHintText: {
    ...typography.caption,
    flex: 1,
    color: colors.textMuted,
    lineHeight: 19,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    marginTop: 20,
    marginBottom: 40,
    gap: 8,
  },
  logoutText: {
    ...typography.h3,
    color: colors.danger,
  },
  
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  modalContent: {
    padding: 20,
  },
  editAvatarButton: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  editAvatarImage: {
    width: '100%',
    height: '100%',
  },
  editAvatarOverlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: 'rgba(2, 6, 23, 0.64)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  editAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  inputLabel: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Righteous_400Regular',
    marginBottom: 32,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  followModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
    padding: 16,
  },
  followModalSheet: {
    width: '100%',
    maxHeight: '78%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  followModalHeader: {
    minHeight: 64,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  followModalTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  followModalMeta: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
    marginTop: 2,
  },
  followModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  followModalLoader: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followListContent: {
    padding: 16,
    gap: 12,
  },
  followListEmptyContent: {
    minHeight: 190,
    justifyContent: 'center',
  },
  followUserRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  followUserAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  followUserName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
    flex: 1,
  },
  followEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  followEmptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
});
