import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Award, Beer, Camera, Edit2, Flame, LogOut, MapPin, Moon, Trophy, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { confirmDestructive } from '../lib/dialogs';
import { imageFromPickerAsset, SelectedImage, uploadImageToBucket } from '../lib/imageUpload';
import * as ImagePicker from 'expo-image-picker';

const getVolumeMl = (vol: string) => {
  switch (vol?.toLowerCase()) {
    case '25cl': return 250;
    case '33cl': return 330;
    case 'schooner': return 379; // UK standard
    case 'pint': return 568; // UK pint
    case '50cl': return 500;
    default: return 568; // Default to pint if unknown
  }
};

type Stats = {
  totalPints: number;
  uniquePubs: number;
  avgAbv: number;
  maxSessionPints: number;
  strongestAbv: number;
  hasLateNightSession: boolean;
};

type TrophyKind = 'pints' | 'pubs' | 'session' | 'abv' | 'late';

type TrophyDefinition = {
  id: string;
  title: string;
  description: string;
  kind: TrophyKind;
  earned: boolean;
};

const emptyStats: Stats = {
  totalPints: 0,
  uniquePubs: 0,
  avgAbv: 0,
  maxSessionPints: 0,
  strongestAbv: 0,
  hasLateNightSession: false,
};

const roundStat = (value: number) => Math.round(value * 10) / 10;

const isLateNightSession = (createdAt?: string) => {
  if (!createdAt) return false;

  const hour = new Date(createdAt).getHours();
  return hour >= 3 && hour < 6;
};

const getTrophies = (stats: Stats): TrophyDefinition[] => {
  const totalPintTrophies = [10, 50, 100, 200, 500, 1000].map((threshold) => ({
    id: `total-${threshold}`,
    title: `${threshold} Pint Club`,
    description: `${threshold}+ true pints recorded`,
    kind: 'pints' as const,
    earned: stats.totalPints >= threshold,
  }));

  const pubTrophies = [5, 10, 20, 50, 100].map((threshold) => ({
    id: `pubs-${threshold}`,
    title: `${threshold} Pub Tour`,
    description: `${threshold}+ unique pubs visited`,
    kind: 'pubs' as const,
    earned: stats.uniquePubs >= threshold,
  }));

  const sessionTrophies = [5, 10, 15, 20, 25].map((threshold) => ({
    id: `session-${threshold}`,
    title: `${threshold} Pint Session`,
    description: `${threshold}+ true pints in one session`,
    kind: 'session' as const,
    earned: stats.maxSessionPints >= threshold,
  }));

  const abvTrophies = [6, 7, 8, 9, 10, 11].map((threshold) => ({
    id: `abv-${threshold}`,
    title: `Over ${threshold}% ABV`,
    description: `Logged a beer above ${threshold}%`,
    kind: 'abv' as const,
    earned: stats.strongestAbv > threshold,
  }));

  return [
    {
      id: 'first-pint',
      title: 'First Pint',
      description: 'Record your first beer session',
      kind: 'pints',
      earned: stats.totalPints > 0,
    },
    ...totalPintTrophies,
    ...pubTrophies,
    ...sessionTrophies,
    ...abvTrophies,
    {
      id: 'late-night',
      title: 'Late Night Beer',
      description: 'Record a session after 3am',
      kind: 'late',
      earned: stats.hasLateNightSession,
    },
  ];
};

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

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profileError) {
        console.error(profileError);
      }

      const currentProfile = profileData || fallbackProfile;
      setProfile(currentProfile);
      setEditUsername(currentProfile.username || '');
      setEditAvatarUri(currentProfile.avatar_url);
      setEditAvatar(null);

      const { data: sessions } = await supabase
        .from('sessions')
        .select('pub_name, volume, quantity, abv, created_at')
        .eq('user_id', user.id);

      if (sessions && sessions.length > 0) {
        const uniquePubs = new Set(sessions.map(s => s.pub_name)).size;
        
        let totalMl = 0;
        let weightedAbvSum = 0;
        let maxSessionPints = 0;
        let strongestAbv = 0;
        let hasLateNightSession = false;

        sessions.forEach(s => {
          const ml = getVolumeMl(s.volume);
          const qty = s.quantity || 1; // Default to 1 for older logs
          const abv = s.abv || 0; // Default to 0 for older logs

          const sessionVolMl = ml * qty;
          const sessionPints = sessionVolMl / 568;

          totalMl += sessionVolMl;
          weightedAbvSum += sessionVolMl * abv;
          maxSessionPints = Math.max(maxSessionPints, sessionPints);
          strongestAbv = Math.max(strongestAbv, abv);
          hasLateNightSession = hasLateNightSession || isLateNightSession(s.created_at);
        });

        // Convert total ml to UK Pints (568ml)
        const truePints = roundStat(totalMl / 568);
        const avgAbv = totalMl > 0 ? roundStat(weightedAbvSum / totalMl) : 0;

        setStats({ 
          totalPints: truePints, 
          uniquePubs, 
          avgAbv,
          maxSessionPints: roundStat(maxSessionPints),
          strongestAbv: roundStat(strongestAbv),
          hasLateNightSession,
        });
      } else {
        setStats(emptyStats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
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
        const image = imageFromPickerAsset(asset);
        setEditAvatarUri(image.uri);
        setEditAvatar(image);
        return;
      }

      const ImageManipulator = await import('expo-image-manipulator');
      const manipResult = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 400, height: 400 } }],
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
      if (editAvatar) {
        avatarUrl = await uploadImageToBucket('session_images', editAvatar, 'avatar');
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
  const trophies = getTrophies(stats);
  const earnedTrophies = trophies.filter((trophy) => trophy.earned);

  const renderTrophyIcon = (kind: TrophyKind, earned: boolean) => {
    const iconColor = earned ? colors.primary : colors.textMuted;
    const iconSize = 28;

    switch (kind) {
      case 'pints':
        return <Beer color={iconColor} size={iconSize} />;
      case 'pubs':
        return <MapPin color={iconColor} size={iconSize} />;
      case 'session':
        return <Trophy color={iconColor} size={iconSize} />;
      case 'abv':
        return <Flame color={iconColor} size={iconSize} />;
      case 'late':
        return <Moon color={iconColor} size={iconSize} />;
      default:
        return <Award color={iconColor} size={iconSize} />;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Image 
            source={{ uri: profile?.avatar_url || 'https://i.pravatar.cc/150?u=' + profile?.id }} 
            style={styles.avatar} 
          />
          <TouchableOpacity style={styles.editBadge} onPress={() => setIsEditing(true)}>
            <Edit2 color={colors.background} size={16} />
          </TouchableOpacity>
        </View>
        <Text style={typography.h1}>{profile?.username || 'Beer Lover'}</Text>
        <Text style={typography.bodyMuted}>Joined {joinDate}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.totalPints}</Text>
          <Text style={styles.statLabel}>True Pints</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.uniquePubs}</Text>
          <Text style={styles.statLabel}>Unique Pubs</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.avgAbv}%</Text>
          <Text style={styles.statLabel}>Avg ABV</Text>
        </View>
      </View>

      <View style={styles.highScoreContainer}>
        <View>
          <Text style={styles.highScoreLabel}>Best Session</Text>
          <Text style={styles.highScoreHint}>Most true pints logged in one session</Text>
        </View>
        <Text style={styles.highScoreValue}>{stats.maxSessionPints}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trophy Cabinet</Text>
          <Text style={styles.sectionMeta}>{earnedTrophies.length}/{trophies.length}</Text>
        </View>

        <View style={styles.badges}>
          {trophies.map((trophy) => (
            <View
              key={trophy.id}
              style={[
                styles.badge,
                trophy.earned ? styles.badgeEarned : styles.badgeLocked,
              ]}
            >
              <View style={[
                styles.badgeIcon,
                trophy.earned ? styles.badgeIconEarned : styles.badgeIconLocked,
              ]}>
                {renderTrophyIcon(trophy.kind, trophy.earned)}
              </View>
              <Text style={[
                styles.badgeText,
                trophy.earned ? styles.badgeTextEarned : styles.badgeTextLocked,
              ]}>
                {trophy.title}
              </Text>
              <Text style={styles.badgeDescription}>{trophy.description}</Text>
            </View>
          ))}
        </View>
      </View>

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
