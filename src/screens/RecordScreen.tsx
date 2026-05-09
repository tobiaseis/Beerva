import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Beer, Camera, Clock, Images, Lock, MapPin, MessageSquare, Trash2, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '../components/AppButton';
import { AutocompleteInput } from '../components/AutocompleteInput';
import { BeerDraftForm } from '../components/BeerDraftForm';
import { Surface } from '../components/Surface';
import { confirmDestructive, showAlert } from '../lib/dialogs';
import { hapticError, hapticSuccess, hapticWarning } from '../lib/haptics';
import {
  deletePublicImageUrl,
  prepareWebImageFromPickerAsset,
  SelectedImage,
  UPLOAD_IMAGE_MAX_WIDTH,
  uploadImageToBucket,
} from '../lib/imageUpload';
import {
  beerDraftToPayload,
  createEmptyBeerDraft,
  getBeerLine,
  getLegacySessionBeerFields,
  SessionBeer,
} from '../lib/sessionBeers';
import { supabase } from '../lib/supabase';
import { useFocused } from '../lib/useFocused';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const beervaLogo = require('../../assets/beerva-header-logo.png');

type ActiveSession = {
  id: string;
  user_id: string;
  pub_name: string;
  status: 'active';
  comment: string | null;
  image_url: string | null;
  started_at: string;
};

type FollowOutRow = {
  following_id: string;
};

type FollowInRow = {
  follower_id: string;
};

const PUB_SEARCH_MIN_LENGTH = 3;

const getStartedLabel = (dateString?: string | null) => {
  if (!dateString) return 'Started recently';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Started recently';
  return `Started ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const createLegacyPlaceholder = () => ({
  beer_name: 'Session in progress',
  volume: 'Pint',
  quantity: 1,
  abv: 0,
});

export const RecordScreen = ({ navigation }: any) => {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessionBeers, setSessionBeers] = useState<SessionBeer[]>([]);
  const [beerDraft, setBeerDraft] = useState(createEmptyBeerDraft);

  const [pub, setPub] = useState('');
  const [pubOptions, setPubOptions] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const commentFocus = useFocused();

  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [photoChoiceVisible, setPhotoChoiceVisible] = useState(false);

  const [loadingActive, setLoadingActive] = useState(true);
  const [starting, setStarting] = useState(false);
  const [addingBeer, setAddingBeer] = useState(false);
  const [ending, setEnding] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const pubSearchCache = useRef<Map<string, string[]>>(new Map());
  const pubSearchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const cleanPub = pub.trim();

    if (activeSession || cleanPub.length < PUB_SEARCH_MIN_LENGTH) {
      setPubOptions([]);
      return;
    }

    const cacheKey = cleanPub.toLowerCase();
    const cachedOptions = pubSearchCache.current.get(cacheKey);
    if (cachedOptions) {
      setPubOptions(cachedOptions);
      return;
    }

    pubSearchAbort.current?.abort();
    const abortController = new AbortController();
    pubSearchAbort.current = abortController;

    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanPub + ' pub')}&format=json&addressdetails=1&countrycodes=dk&limit=8`, {
          headers: { 'User-Agent': 'BeervaApp/1.0 (info@beerva.test)' },
          signal: abortController.signal,
        });
        const data = await response.json();

        if (abortController.signal.aborted) return;

        if (!Array.isArray(data)) {
          setPubOptions([]);
          return;
        }

        const pubs: string[] = data.map((item: any) => {
          const name = item.name || item.address?.pub || item.address?.bar || item.address?.restaurant;
          const city = item.address?.city || item.address?.town || item.address?.village || '';
          return name ? (city ? `${name}, ${city}` : name) : null;
        }).filter(Boolean);

        const uniquePubs = Array.from(new Set(pubs));
        pubSearchCache.current.set(cacheKey, uniquePubs);
        setPubOptions(uniquePubs);
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error('Nominatim error:', e);
        }
      }
    }, 600);

    return () => {
      clearTimeout(delayDebounceFn);
      abortController.abort();
    };
  }, [activeSession, pub]);

  const resetActiveState = useCallback(() => {
    setActiveSession(null);
    setSessionBeers([]);
    setBeerDraft(createEmptyBeerDraft());
    setComment('');
    setSelectedImage(null);
    setExistingImageUrl(null);
  }, []);

  const fetchSessionBeers = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase
      .from('session_beers')
      .select('id, session_id, beer_name, volume, quantity, abv, note, consumed_at, created_at')
      .eq('session_id', sessionId)
      .order('consumed_at', { ascending: true });

    if (error) throw error;
    setSessionBeers((data || []) as SessionBeer[]);
  }, []);

  const fetchActiveSession = useCallback(async () => {
    try {
      setLoadingActive(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        resetActiveState();
        return;
      }

      const { data, error } = await supabase
        .from('sessions')
        .select('id, user_id, pub_name, status, comment, image_url, started_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      const session = (data || [])[0] as ActiveSession | undefined;
      if (!session) {
        resetActiveState();
        return;
      }

      setActiveSession(session);
      setPub('');
      setComment(session.comment || '');
      setExistingImageUrl(session.image_url || null);
      setSelectedImage(null);
      await fetchSessionBeers(session.id);
    } catch (error: any) {
      console.error('Active session fetch error:', error);
      showAlert('Could not load session', error?.message || 'Please try again.');
    } finally {
      setLoadingActive(false);
    }
  }, [fetchSessionBeers, resetActiveState]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveSession();
    }, [fetchActiveSession])
  );

  const ensureProfile = async (user: any) => {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfile) return;

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: user.user_metadata?.username || user.email?.split('@')[0] || 'beer_lover',
      avatar_url: user.user_metadata?.avatar_url || 'https://i.pravatar.cc/150?u=' + user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) throw error;
  };

  const notifyMatesSessionStarted = async (sessionId: string, userId: string) => {
    try {
      const [followingResult, followersResult] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', userId),
        supabase.from('follows').select('follower_id').eq('following_id', userId),
      ]);

      if (followingResult.error) throw followingResult.error;
      if (followersResult.error) throw followersResult.error;

      const followers = new Set(((followersResult.data || []) as FollowInRow[]).map((row) => row.follower_id));
      const mutualIds = ((followingResult.data || []) as FollowOutRow[])
        .map((row) => row.following_id)
        .filter((id) => followers.has(id));

      if (mutualIds.length === 0) return;

      const { error } = await supabase.from('notifications').insert(
        mutualIds.map((mateId) => ({
          user_id: mateId,
          actor_id: userId,
          type: 'session_started',
          reference_id: sessionId,
        }))
      );

      if (error) {
        console.error('Session started notification insert error:', error);
      }
    } catch (error) {
      console.error('Session started notification error:', error);
    }
  };

  const startSession = async () => {
    const trimmedPub = pub.trim();
    if (!trimmedPub) {
      showAlert('Missing pub', 'Choose where you are drinking before starting the session.');
      return;
    }

    setStarting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

      await ensureProfile(user);

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          pub_name: trimmedPub,
          status: 'active',
          started_at: now,
          comment: null,
          image_url: null,
          ...createLegacyPlaceholder(),
        })
        .select('id, user_id, pub_name, status, comment, image_url, started_at')
        .single();

      if (error) throw error;

      const session = data as ActiveSession;
      setActiveSession(session);
      setSessionBeers([]);
      setComment('');
      setSelectedImage(null);
      setExistingImageUrl(null);
      setPub('');
      hapticSuccess();
      notifyMatesSessionStarted(session.id, user.id);
      showAlert('Session started', 'Your mates have been notified. Add beers as you drink them.');
    } catch (error: any) {
      console.error('Start session error:', error);
      if (error?.code === '23505') {
        await fetchActiveSession();
        showAlert('Session already active', 'You already have a drinking session running.');
      } else {
        hapticError();
        showAlert('Could not start session', error?.message || 'Please try again.');
      }
    } finally {
      setStarting(false);
    }
  };

  const syncLegacyFields = async (sessionId: string, beers: SessionBeer[]) => {
    const legacyFields = beers.length > 0 ? getLegacySessionBeerFields(beers) : createLegacyPlaceholder();
    const { error } = await supabase
      .from('sessions')
      .update(legacyFields)
      .eq('id', sessionId);

    if (error) {
      console.warn('Could not sync legacy session fields:', error.message);
    }
  };

  const addBeerToSession = async () => {
    if (!activeSession) return;
    if (!beerDraft.beerName.trim()) {
      showAlert('Missing beer', 'Add the beer you are drinking.');
      return;
    }

    setAddingBeer(true);
    try {
      const payload = {
        session_id: activeSession.id,
        ...beerDraftToPayload(beerDraft),
        consumed_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('session_beers')
        .insert(payload)
        .select('id, session_id, beer_name, volume, quantity, abv, note, consumed_at, created_at')
        .single();

      if (error) throw error;

      const nextBeers = [...sessionBeers, data as SessionBeer];
      setSessionBeers(nextBeers);
      setBeerDraft(createEmptyBeerDraft());
      syncLegacyFields(activeSession.id, nextBeers);
      hapticSuccess();
    } catch (error: any) {
      console.error('Add beer error:', error);
      hapticError();
      showAlert('Could not add beer', error?.message || 'Please try again.');
    } finally {
      setAddingBeer(false);
    }
  };

  const removeBeerFromSession = async (beer: SessionBeer) => {
    if (!activeSession || !beer.id) return;

    hapticWarning();
    const nextBeers = sessionBeers.filter((item) => item.id !== beer.id);
    setSessionBeers(nextBeers);

    const { error } = await supabase
      .from('session_beers')
      .delete()
      .eq('id', beer.id)
      .eq('session_id', activeSession.id);

    if (error) {
      setSessionBeers(sessionBeers);
      showAlert('Could not remove beer', error.message);
      return;
    }

    syncLegacyFields(activeSession.id, nextBeers);
  };

  const handleImageAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (Platform.OS === 'web') {
      setSelectedImage(await prepareWebImageFromPickerAsset(asset));
      return;
    }

    const ImageManipulator = await import('expo-image-manipulator');
    const manipResult = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: UPLOAD_IMAGE_MAX_WIDTH } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    setSelectedImage({
      uri: manipResult.uri,
      mimeType: 'image/jpeg',
    });
  };

  const chooseFromLibrary = async () => {
    setPhotoChoiceVisible(false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      await handleImageAsset(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    setPhotoChoiceVisible(false);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert('Camera access needed', 'Allow camera access to take a new session photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
      cameraType: ImagePicker.CameraType.back,
    });

    if (!result.canceled && result.assets[0]) {
      await handleImageAsset(result.assets[0]);
    }
  };

  const endSession = async () => {
    if (!activeSession) return;
    if (sessionBeers.length === 0) {
      showAlert('Add a beer first', 'A session needs at least one beer before it can be posted.');
      return;
    }

    setEnding(true);
    let uploadedUrl: string | null = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

      if (selectedImage) {
        uploadedUrl = await uploadImageToBucket('session_images', selectedImage, `users/${user.id}/sessions`);
      }

      const now = new Date().toISOString();
      const imageUrl = uploadedUrl || existingImageUrl;
      const { error } = await supabase
        .from('sessions')
        .update({
          status: 'published',
          ended_at: now,
          published_at: now,
          comment: comment.trim() || null,
          image_url: imageUrl,
          ...getLegacySessionBeerFields(sessionBeers),
        })
        .eq('id', activeSession.id)
        .eq('user_id', user.id);

      if (error) throw error;

      if (uploadedUrl && existingImageUrl && existingImageUrl !== uploadedUrl) {
        deletePublicImageUrl('session_images', existingImageUrl);
      }

      resetActiveState();
      setPub('');
      hapticSuccess();
      showAlert('Posted', 'Your drinking session is now on the feed.');
      navigation.navigate('Feed');
    } catch (error: any) {
      console.error('End session error:', error);
      if (uploadedUrl) {
        deletePublicImageUrl('session_images', uploadedUrl);
      }
      hapticError();
      showAlert('Could not end session', error?.message || 'Please try again.');
    } finally {
      setEnding(false);
    }
  };

  const cancelSession = () => {
    if (!activeSession || cancelling) return;

    hapticWarning();
    confirmDestructive('Cancel Session', 'Discard this active drinking session?', 'Cancel Session', async () => {
      setCancelling(true);
      try {
        const { error } = await supabase
          .from('sessions')
          .update({ status: 'cancelled', ended_at: new Date().toISOString() })
          .eq('id', activeSession.id)
          .eq('status', 'active');

        if (error) throw error;

        if (existingImageUrl) {
          deletePublicImageUrl('session_images', existingImageUrl);
        }

        resetActiveState();
      } catch (error: any) {
        showAlert('Could not cancel session', error?.message || 'Please try again.');
      } finally {
        setCancelling(false);
      }
    });
  };

  const previewImageUri = selectedImage?.uri || existingImageUrl;

  if (loadingActive) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="always"
      nestedScrollEnabled
    >
      <View style={styles.header}>
        <Text style={typography.h2}>{activeSession ? 'Drinking Session' : 'Start Session'}</Text>
      </View>

      <View style={styles.content}>
        {!activeSession ? (
          <Surface style={styles.formSurface}>
            <Text style={styles.introTitle}>Where are you drinking?</Text>
            <AutocompleteInput
              value={pub}
              onChangeText={setPub}
              data={pubOptions.length > 0 ? pubOptions : [pub]}
              placeholder="Search pub"
              icon={<MapPin color={colors.textMuted} size={20} />}
            />
            <AppButton label="Start Session" onPress={startSession} loading={starting} />
          </Surface>
        ) : (
          <>
            <Surface style={styles.lockedPubSurface}>
              <View style={styles.lockedPubHeader}>
                <View style={styles.lockedPubIcon}>
                  <Lock color={colors.primary} size={20} />
                </View>
                <View style={styles.lockedPubText}>
                  <Text style={styles.lockedPubLabel}>Drinking at</Text>
                  <Text style={styles.lockedPubName}>{activeSession.pub_name}</Text>
                </View>
              </View>
              <View style={styles.startedRow}>
                <Clock color={colors.textMuted} size={15} />
                <Text style={styles.startedText}>{getStartedLabel(activeSession.started_at)}</Text>
              </View>
            </Surface>

            <Surface style={styles.formSurface}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Beers</Text>
                <Text style={styles.sectionMeta}>{sessionBeers.length}</Text>
              </View>

              {sessionBeers.length === 0 ? (
                <View style={styles.emptyBeerList}>
                  <Beer color={colors.textMuted} size={24} />
                  <Text style={styles.emptyBeerText}>No beers added yet.</Text>
                </View>
              ) : (
                <View style={styles.beerList}>
                  {sessionBeers.map((beer) => (
                    <View key={beer.id || `${beer.beer_name}-${beer.consumed_at}`} style={styles.beerRow}>
                      <Image source={beervaLogo} style={styles.beerRowLogo} />
                      <View style={styles.beerRowText}>
                        <Text style={styles.beerRowTitle}>{beer.beer_name}</Text>
                        <Text style={styles.beerRowMeta}>{getBeerLine(beer)}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.removeBeerButton}
                        onPress={() => removeBeerFromSession(beer)}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        <Trash2 color={colors.danger} size={17} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <BeerDraftForm
                draft={beerDraft}
                onChange={setBeerDraft}
                onSubmit={addBeerToSession}
                submitLabel="Add Beer"
                loading={addingBeer}
              />
            </Surface>

            <Surface style={styles.formSurface}>
              <Text style={styles.sectionTitle}>Post Details</Text>

              <Text style={styles.sectionLabel}>Comment</Text>
              <View style={[styles.commentContainer, commentFocus.focused ? styles.inputFocused : null]}>
                <MessageSquare color={colors.textMuted} size={20} />
                <TextInput
                  style={styles.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Add a tasting note, rating, or story..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={220}
                  textAlignVertical="top"
                  onFocus={commentFocus.onFocus}
                  onBlur={commentFocus.onBlur}
                />
              </View>
              <Text style={styles.characterCount}>{comment.length}/220</Text>

              <TouchableOpacity style={styles.photoButton} onPress={() => setPhotoChoiceVisible(true)} activeOpacity={0.76}>
                {previewImageUri ? (
                  <Image source={{ uri: previewImageUri }} style={styles.imagePreview} />
                ) : (
                  <>
                    <Camera color={colors.primary} size={24} />
                    <Text style={styles.photoText}>Add Photo</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.endActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={cancelSession}
                  disabled={cancelling}
                  activeOpacity={0.76}
                >
                  <Text style={styles.cancelText}>{cancelling ? 'Cancelling...' : 'Cancel'}</Text>
                </TouchableOpacity>
                <View style={styles.endButtonWrap}>
                  <AppButton label="End Session" onPress={endSession} loading={ending} />
                </View>
              </View>
            </Surface>
          </>
        )}
      </View>

      <Modal
        visible={photoChoiceVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoChoiceVisible(false)}
      >
        <View style={styles.photoChoiceBackdrop}>
          <View style={styles.photoChoiceSheet}>
            <View style={styles.photoChoiceHeader}>
              <Text style={styles.photoChoiceTitle}>Add Photo</Text>
              <TouchableOpacity
                style={styles.photoChoiceClose}
                onPress={() => setPhotoChoiceVisible(false)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X color={colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.photoChoiceOption} onPress={takePhoto} activeOpacity={0.76}>
              <View style={styles.photoChoiceIcon}>
                <Camera color={colors.primary} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Take Photo</Text>
                <Text style={styles.photoChoiceHint}>Open camera</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoChoiceOption} onPress={chooseFromLibrary} activeOpacity={0.76}>
              <View style={styles.photoChoiceIcon}>
                <Images color={colors.primary} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Upload Photo</Text>
                <Text style={styles.photoChoiceHint}>Choose from library</Text>
              </View>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 18 : 60,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'web' ? 14 : 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  content: {
    padding: Platform.OS === 'web' ? 16 : 20,
    gap: spacing.lg,
  },
  formSurface: {
    gap: spacing.sm,
  },
  introTitle: {
    ...typography.h3,
  },
  lockedPubSurface: {
    gap: spacing.md,
    ...shadows.card,
  },
  lockedPubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lockedPubIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  lockedPubText: {
    flex: 1,
    minWidth: 0,
  },
  lockedPubLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  lockedPubName: {
    ...typography.h3,
    marginTop: 2,
  },
  startedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  startedText: {
    ...typography.caption,
    color: colors.textMuted,
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
    fontWeight: '800',
  },
  emptyBeerList: {
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    gap: 8,
  },
  emptyBeerText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  beerList: {
    gap: 10,
  },
  beerRow: {
    minHeight: 62,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  beerRowLogo: {
    width: 26,
    height: 25,
    resizeMode: 'contain',
  },
  beerRowText: {
    flex: 1,
    minWidth: 0,
  },
  beerRowTitle: {
    ...typography.body,
    fontWeight: '800',
  },
  beerRowMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  removeBeerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  sectionLabel: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 8,
  },
  commentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 16,
    minHeight: 104,
    gap: 12,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  commentInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    minHeight: 72,
    padding: 0,
  },
  characterCount: {
    ...typography.caption,
    textAlign: 'right',
    marginBottom: 14,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    height: Platform.OS === 'web' ? 132 : 150,
    marginBottom: spacing.md,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoText: {
    ...typography.body,
    color: colors.primary,
    marginLeft: 8,
    fontWeight: '600',
  },
  endActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelButton: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cancelText: {
    ...typography.body,
    fontWeight: '800',
    color: colors.textMuted,
  },
  endButtonWrap: {
    flex: 1,
  },
  photoChoiceBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },
  photoChoiceSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    gap: 12,
  },
  photoChoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  photoChoiceTitle: {
    ...typography.h3,
    color: colors.text,
  },
  photoChoiceClose: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  photoChoiceOption: {
    minHeight: 68,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  photoChoiceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoChoiceText: {
    flex: 1,
  },
  photoChoiceLabel: {
    ...typography.body,
    fontWeight: '800',
  },
  photoChoiceHint: {
    ...typography.caption,
    marginTop: 3,
  },
});
