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
import { supabase } from '../lib/supabase';
import { useFocused } from '../lib/useFocused';
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

export const EditSessionScreen = ({ navigation, route }: any) => {
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
        .select('id, session_id, beer_name, volume, quantity, abv, note, consumed_at, created_at')
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

  const addDraftBeer = () => {
    if (!beerDraft.beerName.trim()) {
      showAlert('Missing beer', 'Add the beer you are drinking.');
      return;
    }

    const beerPayload = beerDraftToPayload(beerDraft);
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

  const saveChanges = async () => {
    if (!session || !sessionId || saving) return;
    if (beers.length === 0) {
      showAlert('Add a beer first', 'A post needs at least one beer.');
      return;
    }

    setSaving(true);
    let uploadedUrl: string | null = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

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
            note: beer.note || null,
            consumed_at: beer.consumed_at || new Date().toISOString(),
          }))
        );

        if (error) throw error;
      }

      const finalImageUrl = removeExistingImage ? null : (uploadedUrl || existingImageUrl);
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

      if ((uploadedUrl || removeExistingImage) && existingImageUrl && existingImageUrl !== finalImageUrl) {
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

      <Surface style={styles.formSurface}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Beers</Text>
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
          submitLabel="Add Beer"
        />
      </Surface>

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
