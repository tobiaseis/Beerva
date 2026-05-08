import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Bell, BellOff, Camera, Edit2, LogOut, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { confirmDestructive, showAlert } from '../lib/dialogs';
import { deletePublicImageUrl, prepareWebImageFromPickerAsset, SelectedImage, UPLOAD_IMAGE_MAX_WIDTH, uploadImageToBucket } from '../lib/imageUpload';
import { ProfileStatsPanel } from '../components/ProfileStatsPanel';
import { emptyStats, Stats } from '../lib/profileStats';
import { fetchProfileStats } from '../lib/profileStatsApi';
import { CachedImage } from '../components/CachedImage';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermissionStatus,
  getPushSupportInfo,
  isCurrentlySubscribed,
} from '../lib/pushNotifications';
import * as ImagePicker from 'expo-image-picker';

export const ProfileScreen = () => {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [loading, setLoading] = useState(true);
  
  // Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
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

      const [profileResult, profileStats] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle(),
        fetchProfileStats(user.id),
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
    const username = editUsername.trim();

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
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const joinDate = profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently';

  return (
    <ScrollView style={styles.container}>
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
      </View>

      <ProfileStatsPanel stats={stats} />

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
              style={styles.input}
              value={editUsername}
              onChangeText={setEditUsername}
              placeholder="BeerLover99"
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity 
              style={styles.saveButton} 
              onPress={saveProfile}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
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
    borderColor: colors.primary,
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
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: Platform.OS === 'web' ? 16 : 20,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderColor: 'rgba(245, 158, 11, 0.32)',
  },
  pushButtonOff: {
    backgroundColor: colors.card,
    borderColor: colors.border,
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
    borderColor: colors.border,
    backgroundColor: colors.card,
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
    borderBottomColor: colors.border,
  },
  modalContent: {
    padding: 20,
  },
  editAvatarButton: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Righteous_400Regular',
    marginBottom: 32,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    ...typography.h3,
    color: colors.background,
  },
});
