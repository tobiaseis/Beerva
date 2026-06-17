import React, { useCallback, useState } from 'react';
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
import { ArrowLeft, Camera, Images, MapPin, MessageSquare, Minus, Plus, Trash2, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '../components/AppButton';
import { BeerDraftForm } from '../components/BeerDraftForm';
import { ChugAttemptModal } from '../components/ChugAttemptModal';
import { ChugBottleButton } from '../components/ChugBottleButton';
import { DrinkingBuddiesPicker } from '../components/DrinkingBuddiesPicker';
import { Surface } from '../components/Surface';
import { showAlert } from '../lib/dialogs';
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
  createClientBeerId,
  createEmptyBeerDraft,
  getBeerLine,
  getLegacySessionBeerFields,
  SessionBeer,
} from '../lib/sessionBeers';
import {
  buildSessionPhotoRecords,
  getAllSessionPhotoUrls,
  SessionPhoto,
} from '../lib/sessionPhotos';
import {
  CHUG_CONTAINER_TYPE,
  CHUG_REQUIRED_VOLUME,
  CHUG_VIDEO_MAX_SECONDS,
} from '../lib/chugAttempts';
import { analyzeChugVideo } from '../lib/chugMediaPipe';
import { chugVideoFromPickerAsset, SelectedChugVideo, uploadChugProofVideo } from '../lib/chugProofStorage';
import { supabase } from '../lib/supabase';
import { useFocused } from '../lib/useFocused';
import { useBeverageCatalog } from '../lib/beverageCatalogContext';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const beervaLogo = require('../../assets/beerva-header-logo.png');

type EditableSession = {
  id: string;
  user_id: string;
  pub_name: string;
  comment: string | null;
  image_url: string | null;
  status: string | null;
};

type FollowOutRow = {
  following_id: string;
};

type FollowInRow = {
  follower_id: string;
};

type MutualFollowerProfile = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

type ChugAnalysisPreview = {
  durationMs: number;
  confidenceScore?: number | null;
  detectedStartMs?: number | null;
  detectedEndMs?: number | null;
};

export const EditSessionScreen = ({ navigation, route }: any) => {
  const { catalog } = useBeverageCatalog();
  const sessionId = route?.params?.sessionId as string | undefined;
  const [session, setSession] = useState<EditableSession | null>(null);
  const [beers, setBeers] = useState<SessionBeer[]>([]);
  const [initialBeerIds, setInitialBeerIds] = useState<string[]>([]);
  const [beerDraft, setBeerDraft] = useState(createEmptyBeerDraft);
  const [comment, setComment] = useState('');
  const commentFocus = useFocused();

  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [photoChoiceVisible, setPhotoChoiceVisible] = useState(false);
  const [chugVisible, setChugVisible] = useState(false);
  const [chugBusy, setChugBusy] = useState(false);
  const [chugAnalyzing, setChugAnalyzing] = useState(false);
  const [chugNeedsManualTiming, setChugNeedsManualTiming] = useState(false);
  const [chugError, setChugError] = useState<string | null>(null);
  const [chugSelectedBeerId, setChugSelectedBeerId] = useState<string | null>(null);
  const [chugSelectedVerifierId, setChugSelectedVerifierId] = useState<string | null>(null);
  const [chugAnalysisPreview, setChugAnalysisPreview] = useState<ChugAnalysisPreview | null>(null);
  const [chugVideo, setChugVideo] = useState<SelectedChugVideo | null>(null);
  const [mutualFollowers, setMutualFollowers] = useState<MutualFollowerProfile[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('id, user_id, pub_name, comment, image_url, status')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!sessionData) throw new Error('Session not found.');

      const { data: beerRows, error: beersError } = await supabase
        .from('session_beers')
        .select('id, session_id, beer_name, volume, quantity, abv, beverage_category, note, consumed_at, created_at')
        .eq('session_id', sessionId)
        .order('consumed_at', { ascending: true });

      if (beersError) throw beersError;

      const loadedBeers = (beerRows || []) as SessionBeer[];
      setSession(sessionData as EditableSession);
      setBeers(loadedBeers);
      setInitialBeerIds(loadedBeers.map((beer) => beer.id).filter(Boolean) as string[]);
      setComment(sessionData.comment || '');
      setExistingImageUrl(sessionData.image_url || null);
      setRemoveExistingImage(false);
      setSelectedImage(null);
      setBeerDraft(createEmptyBeerDraft());
      setChugVisible(false);
      setChugBusy(false);
      setChugAnalyzing(false);
      setChugNeedsManualTiming(false);
      setChugError(null);
      setChugSelectedBeerId(null);
      setChugSelectedVerifierId(null);
      setChugAnalysisPreview(null);
      setChugVideo(null);
      setMutualFollowers([]);
    } catch (error: any) {
      console.error('Edit session fetch error:', error);
      showAlert('Could not load post', error?.message || 'Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, sessionId]);

  useFocusEffect(
    useCallback(() => {
      fetchSession();
    }, [fetchSession])
  );

  const chugSelectedBeer = beers.find((beer) => beer.id === chugSelectedBeerId) || null;

  const addDraftBeer = () => {
    if (!beerDraft.beerName.trim()) {
      showAlert('Missing drink', 'Add what you are drinking.');
      return;
    }

    const beerPayload = beerDraftToPayload(beerDraft, catalog);
    setBeers((previous) => [
      ...previous,
      {
        clientId: createClientBeerId(),
        session_id: sessionId,
        ...beerPayload,
        consumed_at: new Date().toISOString(),
      },
    ]);
    setBeerDraft(createEmptyBeerDraft());
    hapticSuccess();
  };

  const addPersistedChugBeer = async (beerName: string): Promise<SessionBeer | null> => {
    if (!sessionId) return null;

    try {
      const { data, error } = await supabase
        .from('session_beers')
        .insert({
          session_id: sessionId,
          ...beerDraftToPayload({
            beerName,
            volume: CHUG_REQUIRED_VOLUME,
            quantity: 1,
          }, catalog),
          consumed_at: new Date().toISOString(),
        })
        .select('id, session_id, beer_name, volume, quantity, abv, beverage_category, note, consumed_at, created_at')
        .single();

      if (error) throw error;

      const createdBeer = data as SessionBeer;
      setBeers((previous) => [...previous, createdBeer]);
      if (createdBeer.id) {
        setInitialBeerIds((previous) => (
          previous.includes(createdBeer.id as string) ? previous : [...previous, createdBeer.id as string]
        ));
      }
      hapticSuccess();
      return createdBeer;
    } catch (error: any) {
      console.error('Add chug beer error:', error);
      hapticError();
      setChugError(error?.message || 'Could not add the chug beer.');
      return null;
    }
  };

  const loadMutualFollowers = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const [followingResult, followersResult] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
    ]);

    if (followingResult.error) throw followingResult.error;
    if (followersResult.error) throw followersResult.error;

    const followers = new Set(((followersResult.data || []) as FollowInRow[]).map((row) => row.follower_id));
    const mutualIds = ((followingResult.data || []) as FollowOutRow[])
      .map((row) => row.following_id)
      .filter((id) => followers.has(id));

    if (mutualIds.length === 0) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', mutualIds)
      .order('username', { ascending: true });

    if (error) throw error;
    return (data || []) as MutualFollowerProfile[];
  };

  const openChugFlow = async () => {
    if (!sessionId || saving) return;

    setChugVisible(true);
    setChugError(null);
    setChugAnalysisPreview(null);
    setChugNeedsManualTiming(false);
    setChugAnalyzing(false);
    setChugVideo(null);
    setChugSelectedBeerId(null);
    setChugSelectedVerifierId(null);

    try {
      const followers = await loadMutualFollowers();
      setMutualFollowers(followers);
    } catch (error: any) {
      setChugError(error?.message || 'Could not load mutual followers.');
    }
  };

  const createChugBeer = async (beerName: string) => {
    if (chugBusy) return;
    setChugBusy(true);

    try {
      const createdBeer = await addPersistedChugBeer(beerName);
      if (createdBeer?.id) {
        setChugSelectedBeerId(createdBeer.id);
        setChugError(null);
      }
    } finally {
      setChugBusy(false);
    }
  };

  const recordChugVideo = async () => {
    if (!sessionId || !chugSelectedBeerId || !chugSelectedVerifierId || chugBusy) return;

    setChugBusy(true);
    setChugError(null);
    setChugAnalysisPreview(null);
    setChugNeedsManualTiming(false);
    setChugVideo(null);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setChugError('Camera access is needed to record a chug attempt.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 0.65,
        videoMaxDuration: CHUG_VIDEO_MAX_SECONDS,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Low,
        cameraType: ImagePicker.CameraType.back,
      });

      if (result.canceled || !result.assets[0]) return;

      const preparedVideo = await chugVideoFromPickerAsset(result.assets[0]);
      setChugVideo(preparedVideo);
      setChugAnalyzing(true);

      try {
        const analysis = await analyzeChugVideo(preparedVideo);

        if (!analysis.ok || !analysis.durationMs) {
          setChugNeedsManualTiming(true);
          setChugError(analysis.reason || 'Could not detect a clean chug start and stop.');
          return;
        }

        setChugAnalysisPreview({
          durationMs: analysis.durationMs,
          confidenceScore: analysis.confidenceScore,
          detectedStartMs: analysis.detectedStartMs,
          detectedEndMs: analysis.detectedEndMs,
        });
      } catch (analysisError: any) {
        setChugNeedsManualTiming(true);
        setChugError(analysisError?.message || 'Could not analyze this chug attempt.');
      } finally {
        setChugAnalyzing(false);
      }
    } catch (error: any) {
      setChugError(error?.message || 'Could not analyze this chug attempt.');
    } finally {
      setChugBusy(false);
    }
  };

  const saveChugAttempt = async (timingSource: 'ai' | 'pending_manual') => {
    const durationMs = timingSource === 'ai' ? chugAnalysisPreview?.durationMs ?? null : null;
    if (
      !session
      || !sessionId
      || !chugSelectedBeerId
      || !chugSelectedVerifierId
      || !chugVideo
      || (timingSource === 'ai' && !chugAnalysisPreview)
      || chugBusy
    ) {
      return;
    }

    setChugBusy(true);
    setChugError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      const videoPath = await uploadChugProofVideo(chugVideo, user.id);
      const { data: attempt, error } = await supabase
        .from('session_chug_attempts')
        .insert({
          session_id: sessionId,
          session_beer_id: chugSelectedBeerId,
          user_id: user.id,
          verifier_user_id: chugSelectedVerifierId,
          status: 'unverified',
          duration_ms: durationMs,
          ai_duration_ms: durationMs,
          timing_source: timingSource,
          confidence_score: chugAnalysisPreview?.confidenceScore ?? null,
          detected_start_ms: chugAnalysisPreview?.detectedStartMs ?? null,
          detected_end_ms: chugAnalysisPreview?.detectedEndMs ?? null,
          container_type: CHUG_CONTAINER_TYPE,
          required_volume: CHUG_REQUIRED_VOLUME,
          video_path: videoPath,
        })
        .select('id')
        .single();

      if (error) throw error;

      const selectedBeer = beers.find((beer) => beer.id === chugSelectedBeerId);
      const { error: notifError } = await supabase.from('notifications').insert({
        user_id: chugSelectedVerifierId,
        actor_id: user.id,
        type: 'chug_verification',
        reference_id: attempt.id,
        metadata: {
          target_type: 'chug_attempt',
          session_id: sessionId,
          beer_name: selectedBeer?.beer_name || null,
          duration_ms: durationMs,
          pub_name: session.pub_name,
        },
      });

      if (notifError) console.error('Chug verification notification insert error:', notifError);

      setChugVisible(false);
      setChugAnalysisPreview(null);
      setChugNeedsManualTiming(false);
      setChugVideo(null);
      hapticSuccess();
      showAlert(
        'Chug saved',
        timingSource === 'pending_manual'
          ? 'Your mate will set the time while reviewing the video.'
          : 'Your result is on the post as unverified until your mate reviews it.'
      );
    } catch (error: any) {
      hapticError();
      setChugError(error?.message || 'Could not save chug attempt.');
    } finally {
      setChugBusy(false);
    }
  };

  const acceptChugAttempt = () => saveChugAttempt('ai');
  const sendChugForManualTiming = () => saveChugAttempt('pending_manual');

  const removeBeer = (beer: SessionBeer) => {
    hapticWarning();
    setBeers((previous) => previous.filter((item) => (item.id || item.clientId) !== (beer.id || beer.clientId)));
  };

  const updateBeerQuantity = (beer: SessionBeer, delta: number) => {
    setBeers((previous) => previous.map((item) => {
      if ((item.id || item.clientId) !== (beer.id || beer.clientId)) return item;
      return {
        ...item,
        quantity: Math.max(1, (item.quantity || 1) + delta),
      };
    }));
  };

  const handleImageAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (Platform.OS === 'web') {
      setSelectedImage(await prepareWebImageFromPickerAsset(asset));
      setRemoveExistingImage(false);
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
    setRemoveExistingImage(false);
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

  const removePhoto = () => {
    setSelectedImage(null);
    setRemoveExistingImage(true);
  };

  const fetchCurrentSessionPhotoUrls = async () => {
    if (!sessionId) return existingImageUrl ? [existingImageUrl] : [];

    const { data, error } = await supabase
      .from('session_photos')
      .select('id, session_id, image_url, is_keeper, expires_at, created_at')
      .eq('session_id', sessionId);

    if (error) throw error;
    return getAllSessionPhotoUrls((data || []) as SessionPhoto[], existingImageUrl);
  };

  const saveChanges = async () => {
    if (!session || !sessionId || saving) return;
    if (beers.length === 0) {
      showAlert('Add a drink first', 'A post needs at least one drink.');
      return;
    }

    setSaving(true);
    let uploadedUrl: string | null = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

      const shouldSyncPhotoRecords = Boolean(selectedImage) || removeExistingImage;
      const previousPhotoUrls = shouldSyncPhotoRecords ? await fetchCurrentSessionPhotoUrls() : [];

      if (selectedImage) {
        uploadedUrl = await uploadImageToBucket('session_images', selectedImage, `users/${user.id}/sessions`);
      }

      const currentExistingIds = beers.map((beer) => beer.id).filter(Boolean) as string[];
      const currentExistingIdSet = new Set(currentExistingIds);
      const removedIds = initialBeerIds.filter((id) => !currentExistingIdSet.has(id));
      const existingBeers = beers.filter((beer) => beer.id);
      const newBeers = beers.filter((beer) => !beer.id);

      const updateResults = await Promise.all(existingBeers.map((beer) => (
        supabase
          .from('session_beers')
          .update({
            beer_name: beer.beer_name.trim(),
            volume: beer.volume || 'Pint',
            quantity: beer.quantity || 1,
            abv: beer.abv ?? null,
            beverage_category: beer.beverage_category === 'wine' || beer.beverage_category === 'drink'
              ? beer.beverage_category
              : 'beer',
            note: beer.note || null,
          })
          .eq('id', beer.id)
          .eq('session_id', sessionId)
      )));

      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) throw updateError;

      if (removedIds.length > 0) {
        const { error } = await supabase
          .from('session_beers')
          .delete()
          .eq('session_id', sessionId)
          .in('id', removedIds);

        if (error) throw error;
      }

      if (newBeers.length > 0) {
        const { error } = await supabase.from('session_beers').insert(
          newBeers.map((beer) => ({
            session_id: sessionId,
            beer_name: beer.beer_name.trim(),
            volume: beer.volume || 'Pint',
            quantity: beer.quantity || 1,
            abv: beer.abv ?? null,
            beverage_category: beer.beverage_category === 'wine' || beer.beverage_category === 'drink'
              ? beer.beverage_category
              : 'beer',
            note: beer.note || null,
            consumed_at: beer.consumed_at || new Date().toISOString(),
          }))
        );

        if (error) throw error;
      }

      const finalImageUrl = removeExistingImage ? null : (uploadedUrl || existingImageUrl);
      if (shouldSyncPhotoRecords) {
        const photoRecords = finalImageUrl ? buildSessionPhotoRecords(sessionId, [finalImageUrl]) : [];
        const { error: deletePhotoError } = await supabase
          .from('session_photos')
          .delete()
          .eq('session_id', sessionId);
        if (deletePhotoError) throw deletePhotoError;

        if (photoRecords.length > 0) {
          const { error: insertPhotoError } = await supabase
            .from('session_photos')
            .insert(photoRecords);
          if (insertPhotoError) throw insertPhotoError;
        }
      }

      const { error: sessionError } = await supabase
        .from('sessions')
        .update({
          comment: comment.trim() || null,
          image_url: finalImageUrl,
          edited_at: new Date().toISOString(),
          ...getLegacySessionBeerFields(beers),
        })
        .eq('id', sessionId)
        .eq('user_id', user.id);

      if (sessionError) throw sessionError;

      if (shouldSyncPhotoRecords) {
        const nextPhotoUrls = new Set(finalImageUrl ? [finalImageUrl] : []);
        previousPhotoUrls
          .filter((imageUrl) => !nextPhotoUrls.has(imageUrl))
          .forEach((imageUrl) => deletePublicImageUrl('session_images', imageUrl));
      } else if ((uploadedUrl || removeExistingImage) && existingImageUrl && existingImageUrl !== finalImageUrl) {
        deletePublicImageUrl('session_images', existingImageUrl);
      }

      hapticSuccess();
      showAlert('Post updated', 'Your session has been updated.');
      navigation.goBack();
    } catch (error: any) {
      console.error('Save edited session error:', error);
      if (uploadedUrl) {
        deletePublicImageUrl('session_images', uploadedUrl);
      }
      hapticError();
      showAlert('Could not save changes', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const previewImageUri = selectedImage?.uri || (!removeExistingImage ? existingImageUrl : null);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.loader}>
        <Text style={typography.bodyMuted}>Post not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Edit Post</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <Surface style={styles.lockedPubSurface}>
        <View style={styles.pubRow}>
          <MapPin color={colors.primary} size={20} />
          <View style={styles.pubText}>
            <Text style={styles.pubLabel}>Pub</Text>
            <Text style={styles.pubName}>{session.pub_name}</Text>
          </View>
        </View>
      </Surface>

      {sessionId ? (
        <DrinkingBuddiesPicker
          sessionId={sessionId}
          disabled={saving}
        />
      ) : null}

      <Surface style={styles.formSurface}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Drinks</Text>
          <Text style={styles.sectionMeta}>{beers.length}</Text>
        </View>

        <View style={styles.beerList}>
          {beers.map((beer) => (
            <View key={beer.id || beer.clientId} style={styles.beerRow}>
              <Image source={beervaLogo} style={styles.beerRowLogo} />
              <View style={styles.beerRowText}>
                <Text style={styles.beerRowTitle}>{beer.beer_name}</Text>
                <Text style={styles.beerRowMeta}>{getBeerLine(beer)}</Text>
              </View>
              <View style={styles.quantityControls}>
                <TouchableOpacity style={styles.quantityButton} onPress={() => updateBeerQuantity(beer, -1)}>
                  <Minus color={colors.primary} size={15} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.quantityButton} onPress={() => updateBeerQuantity(beer, 1)}>
                  <Plus color={colors.primary} size={15} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.removeBeerButton} onPress={() => removeBeer(beer)}>
                <Trash2 color={colors.danger} size={17} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <BeerDraftForm
          draft={beerDraft}
          onChange={setBeerDraft}
          onSubmit={addDraftBeer}
          submitLabel="Add Booze"
        />
      </Surface>

      <ChugBottleButton onPress={openChugFlow} disabled={saving} style={styles.chugBottleMargin} />

      <Surface style={styles.formSurface}>
        <Text style={styles.sectionTitle}>Details</Text>

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

        {previewImageUri ? (
          <TouchableOpacity style={styles.removePhotoButton} onPress={removePhoto} activeOpacity={0.76}>
            <Trash2 color={colors.danger} size={17} />
            <Text style={styles.removePhotoText}>Remove Photo</Text>
          </TouchableOpacity>
        ) : null}

        <AppButton label="Save Changes" onPress={saveChanges} loading={saving} />
      </Surface>

      <ChugAttemptModal
        visible={chugVisible}
        mutualFollowers={mutualFollowers}
        selectedBeer={chugSelectedBeer}
        selectedVerifierId={chugSelectedVerifierId}
        analysisPreview={chugAnalysisPreview}
        needsManualTiming={chugNeedsManualTiming}
        analyzing={chugAnalyzing}
        busy={chugBusy}
        error={chugError}
        onClose={() => setChugVisible(false)}
        onCreateBeer={createChugBeer}
        onSelectVerifier={setChugSelectedVerifierId}
        onRecord={recordChugVideo}
        onRetry={recordChugVideo}
        onAccept={acceptChugAttempt}
        onSubmitManualTiming={sendChugForManualTiming}
      />

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
  content: {
    paddingBottom: Platform.OS === 'web' ? 24 : 32,
    gap: spacing.lg,
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
  lockedPubSurface: {
    marginHorizontal: 16,
    marginTop: 16,
    ...shadows.card,
  },
  pubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pubText: {
    flex: 1,
    minWidth: 0,
  },
  pubLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  pubName: {
    ...typography.h3,
    marginTop: 2,
  },
  formSurface: {
    marginHorizontal: 16,
    gap: spacing.sm,
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
    gap: 9,
  },
  beerRowLogo: {
    width: 25,
    height: 24,
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
  quantityControls: {
    flexDirection: 'row',
    gap: 5,
  },
  quantityButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  removeBeerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  chugBottleMargin: {
    marginHorizontal: 16,
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
  removePhotoButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  removePhotoText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: '800',
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
