import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Bell, BellOff, Camera, LogOut } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { deletePublicImageUrl, prepareWebImageFromPickerAsset, SelectedImage, UPLOAD_IMAGE_MAX_WIDTH, uploadImageToBucket } from '../lib/imageUpload';
import { CachedImage } from '../components/CachedImage';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { getUsernameSaveErrorMessage, normalizeUsername } from '../lib/usernames';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermissionStatus,
  getPushSupportInfo,
  isCurrentlySubscribed,
} from '../lib/pushNotifications';

type ProfileSetupScreenProps = {
  onComplete: () => void;
};

export const ProfileSetupScreen = ({ onComplete }: ProfileSetupScreenProps) => {
  const [username, setUsername] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<SelectedImage | null>(null);
  const [previousAvatarUri, setPreviousAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushUnsupportedReason, setPushUnsupportedReason] = useState<string | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPushState = async () => {
    const support = getPushSupportInfo();
    setPushSupported(support.supported);
    setPushUnsupportedReason(support.supported ? null : support.reason || null);

    if (!support.supported) {
      setPushSubscribed(false);
      return;
    }

    setPushSubscribed(await isCurrentlySubscribed());
  };

  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        const defaultUsername = profile?.username
          || user.user_metadata?.username
          || user.email?.split('@')[0]
          || '';

        setUsername(defaultUsername);
        const defaultAvatar = profile?.avatar_url || user.user_metadata?.avatar_url || null;
        setAvatarUri(defaultAvatar);
        setPreviousAvatarUri(defaultAvatar);
      } catch (error) {
        console.error('Profile setup defaults error:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDefaults();
    refreshPushState();
  }, []);

  const togglePush = async () => {
    if (pushBusy) return;

    setPushBusy(true);
    try {
      if (pushSubscribed) {
        await disablePushNotifications();
        setPushSubscribed(false);
        Alert.alert('Push notifications off', 'You will no longer get push alerts on this device.');
        return;
      }

      const result = await enablePushNotifications();
      if (result.ok) {
        setPushSubscribed(true);
        Alert.alert('Push notifications on', 'We will buzz you when someone cheers or invites you.');
        return;
      }

      const status = getPushPermissionStatus();
      if (status === 'denied') {
        Alert.alert(
          'Notifications blocked',
          'Your browser is blocking notifications for Beerva. Re-enable them in your browser settings, then try again.'
        );
      } else {
        Alert.alert('Could not enable push', result.reason || 'Please try again.');
      }
    } finally {
      setPushBusy(false);
    }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled) return;

    const asset = result.assets[0];

    if (Platform.OS === 'web') {
      const image = await prepareWebImageFromPickerAsset(asset);
      setAvatarUri(image.uri);
      setAvatar(image);
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
    setAvatarUri(image.uri);
    setAvatar(image);
  };

  const saveProfile = async () => {
    const cleanUsername = normalizeUsername(username);

    if (!cleanUsername) {
      Alert.alert('Username needed', 'Choose a username so friends can find you.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You need to be logged in to finish your profile.');

      let avatarUrl = avatarUri;
      if (avatar) {
        avatarUrl = await uploadImageToBucket('session_images', avatar, `users/${user.id}/avatars`);
      }

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        username: cleanUsername,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) throw error;

      const { error: userError } = await supabase.auth.updateUser({
        data: {
          username: cleanUsername,
          avatar_url: avatarUrl,
        },
      });

      if (userError) {
        console.error('Auth metadata update error:', userError);
      }

      if (avatar && previousAvatarUri && previousAvatarUri !== avatarUrl) {
        deletePublicImageUrl('session_images', previousAvatarUri);
      }

      onComplete();
    } catch (error: any) {
      Alert.alert('Could not save profile', getUsernameSaveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>One last step</Text>
        <Text style={styles.title}>Set up your beer identity</Text>
        <Text style={styles.subtitle}>Pick the name and photo friends will see when you log a session, earn trophies, and give cheers.</Text>
      </View>

      <TouchableOpacity style={styles.avatarButton} onPress={pickAvatar} activeOpacity={0.78}>
        {avatarUri ? (
          <CachedImage
            uri={avatarUri}
            style={styles.avatarImage}
            recyclingKey={`setup-avatar-${avatarUri}`}
            accessibilityLabel="Profile avatar"
          />
        ) : (
          <Camera color={colors.primary} size={38} />
        )}
        <View style={styles.avatarOverlay}>
          <Text style={styles.avatarOverlayText}>{avatarUri ? 'Change Photo' : 'Add Photo'}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.form}>
        <Text style={styles.inputLabel}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="BeerLover99"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        {pushSupported ? (
          <TouchableOpacity
            style={[styles.pushButton, pushSubscribed ? styles.pushButtonOn : styles.pushButtonOff]}
            onPress={togglePush}
            disabled={pushBusy}
            activeOpacity={0.78}
          >
            {pushSubscribed ? (
              <Bell color={colors.primary} size={20} />
            ) : (
              <BellOff color={colors.textMuted} size={20} />
            )}
            <Text style={[styles.pushButtonText, pushSubscribed ? styles.pushButtonTextOn : null]}>
              {pushBusy
                ? 'Working...'
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

        <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={saving} activeOpacity={0.78}>
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>Finish Profile</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={signOut} activeOpacity={0.7}>
          <LogOut color={colors.textMuted} size={18} />
          <Text style={styles.signOutText}>Use another account</Text>
        </TouchableOpacity>
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
    flexGrow: 1,
    justifyContent: 'center',
    padding: Platform.OS === 'web' ? 24 : 20,
    paddingBottom: Platform.OS === 'web' ? 32 : 36,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.h1,
    textAlign: 'center',
    fontSize: 30,
  },
  subtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 420,
  },
  avatarButton: {
    alignSelf: 'center',
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingVertical: 7,
    alignItems: 'center',
  },
  avatarOverlayText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  form: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Platform.OS === 'web' ? 18 : 20,
  },
  inputLabel: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: 8,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    color: colors.text,
    marginBottom: 18,
  },
  pushButton: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  pushButtonOn: {
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderColor: 'rgba(245, 158, 11, 0.32)',
  },
  pushButtonOff: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  pushButtonText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '800',
  },
  pushButtonTextOn: {
    color: colors.primary,
  },
  pushHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
    gap: 10,
  },
  pushHintText: {
    ...typography.caption,
    flex: 1,
    color: colors.textMuted,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...typography.h3,
    color: colors.background,
  },
  signOutButton: {
    minHeight: 44,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  signOutText: {
    ...typography.bodyMuted,
    fontWeight: '700',
  },
});
