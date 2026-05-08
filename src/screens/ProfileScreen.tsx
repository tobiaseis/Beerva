import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Award, Droplet, Edit2, LogOut, Camera, X } from 'lucide-react-native';
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

export const ProfileScreen = () => {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ totalPints: 0, uniquePubs: 0, avgAbv: 0 });
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
        .select('pub_name, volume, quantity, abv')
        .eq('user_id', user.id);

      if (sessions && sessions.length > 0) {
        const uniquePubs = new Set(sessions.map(s => s.pub_name)).size;
        
        let totalMl = 0;
        let weightedAbvSum = 0;

        sessions.forEach(s => {
          const ml = getVolumeMl(s.volume);
          const qty = s.quantity || 1; // Default to 1 for older logs
          const abv = s.abv || 0; // Default to 0 for older logs

          const sessionVolMl = ml * qty;
          totalMl += sessionVolMl;
          weightedAbvSum += sessionVolMl * abv;
        });

        // Convert total ml to UK Pints (568ml)
        const truePints = (totalMl / 568).toFixed(1);
        const avgAbv = totalMl > 0 ? (weightedAbvSum / totalMl).toFixed(1) : '0.0';

        setStats({ 
          totalPints: parseFloat(truePints), 
          uniquePubs, 
          avgAbv: parseFloat(avgAbv) 
        });
      } else {
        setStats({ totalPints: 0, uniquePubs: 0, avgAbv: 0 });
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trophy Cabinet</Text>
        {stats.totalPints === 0 ? (
           <Text style={[typography.bodyMuted, { textAlign: 'center', marginTop: 20 }]}>Log your first pint to earn a badge!</Text>
        ) : (
          <View style={styles.badges}>
            {stats.totalPints > 0 && (
              <View style={styles.badge}>
                <Droplet color={colors.success} size={32} />
                <Text style={styles.badgeText}>First Pint</Text>
              </View>
            )}
            {stats.uniquePubs >= 5 && (
              <View style={styles.badge}>
                <Award color={colors.primary} size={32} />
                <Text style={styles.badgeText}>Pub Crawler</Text>
              </View>
            )}
          </View>
        )}
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
    paddingTop: 60,
    paddingBottom: 30,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
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
    borderRadius: 16,
    padding: 20,
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
  section: {
    padding: 20,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 16,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  badge: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    ...typography.caption,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600',
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
    paddingTop: 60,
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
