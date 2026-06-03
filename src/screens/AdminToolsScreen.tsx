import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Archive, ArrowLeft, Beer, Camera, Edit3, ImagePlus, Megaphone, Plus, RotateCcw, ShieldCheck, Trophy, X } from 'lucide-react-native';

import { AppButton } from '../components/AppButton';
import {
  AdminBeverage,
  AdminChallenge,
  AdminOfficialPostPublishError,
  archiveAdminChallenge,
  createAdminRequestKey,
  fetchAdminBeverages,
  fetchAdminChallenges,
  fetchAdminOfficialPosts,
  publishAdminOfficialPost,
  restoreAdminChallenge,
  saveAdminBeverage,
  saveAdminChallenge,
} from '../lib/adminApi';
import {
  AdminBeerDraft,
  AdminChallengeDraft,
  AdminOfficialPostDraft,
  adminBeverageToDraft,
  adminChallengeToDraft,
  applyOfficialPostChallengePrefill,
  createEmptyBeerDraft,
  createEmptyChallengeDraft,
  createEmptyOfficialPostDraft,
  fromLocalDateTimeInput,
  validateBeerDraft,
  validateChallengeDraft,
  validateOfficialPostDraft,
} from '../lib/adminTools';
import { useBeverageCatalog } from '../lib/beverageCatalogContext';
import { confirmDestructive } from '../lib/dialogs';
import {
  deletePublicImageUrl,
  prepareWebImageFromPickerAsset,
  SelectedImage,
  UPLOAD_IMAGE_MAX_WIDTH,
  uploadImageToBucket,
} from '../lib/imageUpload';
import { OfficialFeedPost } from '../lib/officialFeedPosts';
import { getBeverageCatalogItem } from '../lib/sessionBeers';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type AdminSegment = 'challenges' | 'beers' | 'official-posts';
type ActiveModal = 'challenge' | 'beer' | 'official-post' | null;

const formatChallengeWindow = (challenge: AdminChallenge) => {
  const start = new Date(challenge.startsAt);
  const end = new Date(challenge.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Invalid date window';
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
};

export const AdminToolsScreen = ({ navigation }: any) => {
  const { refresh: refreshCatalog } = useBeverageCatalog();
  const [activeSegment, setActiveSegment] = useState<AdminSegment>('challenges');
  const [challenges, setChallenges] = useState<AdminChallenge[]>([]);
  const [beverages, setBeverages] = useState<AdminBeverage[]>([]);
  const [officialPosts, setOfficialPosts] = useState<OfficialFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [beerDraft, setBeerDraft] = useState<AdminBeerDraft>(createEmptyBeerDraft);
  const [challengeDraft, setChallengeDraft] = useState<AdminChallengeDraft>(createEmptyChallengeDraft);
  const [selectedChallenge, setSelectedChallenge] = useState<AdminChallenge | null>(null);
  const [officialPostDraft, setOfficialPostDraft] = useState<AdminOfficialPostDraft>(createEmptyOfficialPostDraft);
  const [selectedOfficialPostImage, setSelectedOfficialPostImage] = useState<SelectedImage | null>(null);
  const [officialPostRequestKey, setOfficialPostRequestKey] = useState(createAdminRequestKey);
  const [pendingOfficialPostImageUrl, setPendingOfficialPostImageUrl] = useState<string | null>(null);
  const [officialPostPublishUncertain, setOfficialPostPublishUncertain] = useState(false);

  const loadAll = useCallback(async ({ refresh = false } = {}) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setErrorMessage(null);
    try {
      const [challengeRows, beverageRows, officialPostRows] = await Promise.all([
        fetchAdminChallenges(),
        fetchAdminBeverages(),
        fetchAdminOfficialPosts(),
      ]);
      setChallenges(challengeRows);
      setBeverages(beverageRows);
      setOfficialPosts(officialPostRows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load admin tools.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const closeModal = () => {
    if (saving) return;
    if (activeModal === 'official-post') {
      if (officialPostPublishUncertain) {
        setFormError('Resolve the uncertain publish before closing this post. Press Publish Official Post again to confirm whether it was sent.');
        return;
      }
      setSelectedOfficialPostImage(null);
      setPendingOfficialPostImageUrl(null);
      setOfficialPostPublishUncertain(false);
    }
    setSelectedChallenge(null);
    setActiveModal(null);
    setFormError(null);
  };

  const openNewBeer = () => {
    setBeerDraft(createEmptyBeerDraft());
    setFormError(null);
    setActiveModal('beer');
  };

  const openBeer = (beverage: AdminBeverage) => {
    setBeerDraft(adminBeverageToDraft(beverage));
    setFormError(null);
    setActiveModal('beer');
  };

  const openNewChallenge = () => {
    setSelectedChallenge(null);
    setChallengeDraft(createEmptyChallengeDraft());
    setFormError(null);
    setActiveModal('challenge');
  };

  const openChallenge = (challenge: AdminChallenge) => {
    setSelectedChallenge(challenge);
    setChallengeDraft(adminChallengeToDraft(challenge));
    setFormError(null);
    setActiveModal('challenge');
  };

  const openNewOfficialPost = () => {
    setOfficialPostDraft(createEmptyOfficialPostDraft());
    setSelectedOfficialPostImage(null);
    setOfficialPostRequestKey(createAdminRequestKey());
    setPendingOfficialPostImageUrl(null);
    setOfficialPostPublishUncertain(false);
    setFormError(null);
    setActiveModal('official-post');
  };

  const prepareOfficialPostImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (Platform.OS === 'web') {
      return prepareWebImageFromPickerAsset(asset);
    }

    const ImageManipulator = await import('expo-image-manipulator');
    const manipResult = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: UPLOAD_IMAGE_MAX_WIDTH } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );

    return {
      uri: manipResult.uri,
      mimeType: 'image/jpeg',
    };
  };

  const setOfficialPostPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    if (pendingOfficialPostImageUrl) {
      setFormError('Retry publishing before changing the photo.');
      return;
    }

    try {
      setFormError(null);
      setSelectedOfficialPostImage(await prepareOfficialPostImage(asset));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not prepare official post photo.');
    }
  };

  const removeOfficialPostPhoto = () => {
    if (pendingOfficialPostImageUrl) {
      setFormError('Retry publishing before removing the photo.');
      return;
    }
    setSelectedOfficialPostImage(null);
  };

  const chooseOfficialPostPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    await setOfficialPostPhoto(result.assets[0]);
  };

  const takeOfficialPostPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setFormError('Camera permission is required to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      cameraType: ImagePicker.CameraType.back,
    });
    if (result.canceled || !result.assets[0]) return;
    await setOfficialPostPhoto(result.assets[0]);
  };

  const selectOfficialPostChallenge = (challenge: AdminChallenge | null) => {
    if (!challenge) {
      setOfficialPostDraft((current) => ({ ...current, linkedChallengeId: null }));
      return;
    }

    setOfficialPostDraft((current) => applyOfficialPostChallengePrefill(current, challenge));
  };

  const handleSaveBeer = async () => {
    const validationError = validateBeerDraft(beerDraft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (getBeverageCatalogItem(beerDraft.name)) {
      setFormError('That beer already exists in the built-in catalog.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await saveAdminBeverage({
        id: beerDraft.id,
        name: beerDraft.name.trim(),
        abv: Number(beerDraft.abv.replace(',', '.')),
      });
      const rows = await fetchAdminBeverages();
      setBeverages(rows);
      await refreshCatalog();
      setActiveModal(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save beer.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveChallenge = async () => {
    const validationError = validateChallengeDraft(challengeDraft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const startsAt = fromLocalDateTimeInput(challengeDraft.startsAt);
    const endsAt = fromLocalDateTimeInput(challengeDraft.endsAt);
    const joinClosesAt = fromLocalDateTimeInput(challengeDraft.joinClosesAt);
    if (!startsAt || !endsAt || !joinClosesAt) return;

    setSaving(true);
    setFormError(null);
    try {
      await saveAdminChallenge({
        id: challengeDraft.id,
        title: challengeDraft.title.trim(),
        description: challengeDraft.description.trim(),
        challengeType: challengeDraft.challengeType,
        targetValue: challengeDraft.challengeType === 'target'
          ? Number(challengeDraft.targetValue.replace(',', '.'))
          : null,
        startsAt,
        endsAt,
        joinClosesAt,
        winnerTrophyEnabled: challengeDraft.challengeType === 'leaderboard' && challengeDraft.winnerTrophyEnabled,
        winnerTrophyTitle: challengeDraft.winnerTrophyEnabled
          ? challengeDraft.winnerTrophyTitle.trim()
          : null,
        winnerTrophyDescription: challengeDraft.winnerTrophyEnabled
          ? challengeDraft.winnerTrophyDescription.trim()
          : null,
      });
      setChallenges(await fetchAdminChallenges());
      setSelectedChallenge(null);
      setActiveModal(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save challenge.');
    } finally {
      setSaving(false);
    }
  };

  const selectedChallengeEnded = useMemo(() => {
    if (!selectedChallenge?.endsAt) return false;
    const endsAt = new Date(selectedChallenge.endsAt);
    return !Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= Date.now();
  }, [selectedChallenge]);

  const canArchiveSelectedChallenge = Boolean(
    selectedChallenge
      && !selectedChallenge.archivedAt
      && selectedChallengeEnded
  );

  const canRestoreSelectedChallenge = Boolean(
    selectedChallenge?.archivedAt
  );

  const refreshChallengesAfterStateChange = async () => {
    setSelectedChallenge(null);
    setActiveModal(null);
    try {
      setChallenges(await fetchAdminChallenges());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load admin challenges.');
    }
  };

  const handleArchiveChallenge = () => {
    if (!selectedChallenge || saving) return;

    confirmDestructive(
      'Archive Challenge',
      `Hide "${selectedChallenge.title}" from the app? History, entries, and awards will be kept.`,
      'Archive',
      async () => {
        setSaving(true);
        setFormError(null);
        try {
          await archiveAdminChallenge(selectedChallenge.id);
          await refreshChallengesAfterStateChange();
        } catch (error) {
          setFormError(error instanceof Error ? error.message : 'Could not archive challenge.');
        } finally {
          setSaving(false);
        }
      }
    );
  };

  const handleRestoreChallenge = async () => {
    if (!selectedChallenge || saving) return;

    setSaving(true);
    setFormError(null);
    try {
      await restoreAdminChallenge(selectedChallenge.id);
      await refreshChallengesAfterStateChange();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not restore challenge.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishOfficialPost = async () => {
    const validationError = validateOfficialPostDraft(officialPostDraft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);
    let uploadedUrl = pendingOfficialPostImageUrl;
    let publicationAttempted = false;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      if (selectedOfficialPostImage && !uploadedUrl) {
        uploadedUrl = await uploadImageToBucket(
          'official_post_images',
          selectedOfficialPostImage,
          `admins/${user.id}/posts`
        );
        setPendingOfficialPostImageUrl(uploadedUrl);
      }

      publicationAttempted = true;
      const published = await publishAdminOfficialPost({
        requestKey: officialPostRequestKey,
        title: officialPostDraft.title.trim(),
        body: officialPostDraft.body.trim(),
        imageUrl: uploadedUrl,
        linkedChallengeId: officialPostDraft.linkedChallengeId,
        sendInAppNotification: officialPostDraft.sendInAppNotification,
        notificationBody: officialPostDraft.sendInAppNotification
          ? officialPostDraft.notificationBody.trim()
          : null,
        sendPushNotification: officialPostDraft.sendPushNotification,
        pushTitle: officialPostDraft.sendPushNotification
          ? officialPostDraft.pushTitle.trim()
          : null,
        pushBody: officialPostDraft.sendPushNotification
          ? officialPostDraft.pushBody.trim()
          : null,
      });

      setOfficialPosts((current) => [published, ...current.filter((post) => post.id !== published.id)]);
      setSelectedOfficialPostImage(null);
      setPendingOfficialPostImageUrl(null);
      setOfficialPostPublishUncertain(false);
      setActiveModal(null);
    } catch (error) {
      if (publicationAttempted && error instanceof AdminOfficialPostPublishError && error.uncertain) {
        setOfficialPostPublishUncertain(true);
      } else {
        setOfficialPostPublishUncertain(false);
      }

      if (
        publicationAttempted
        && uploadedUrl
        && error instanceof AdminOfficialPostPublishError
        && !error.uncertain
      ) {
        void deletePublicImageUrl('official_post_images', uploadedUrl);
        setPendingOfficialPostImageUrl(null);
      }
      setFormError(error instanceof Error ? error.message : 'Could not publish official post.');
    } finally {
      setSaving(false);
    }
  };

  const emptyCopy = useMemo(() => (
    activeSegment === 'challenges'
      ? 'No challenges yet.'
      : activeSegment === 'beers'
        ? 'No admin-added beers yet.'
        : 'No official posts yet.'
  ), [activeSegment]);

  const renderChallenge = useCallback(({ item }: { item: AdminChallenge }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={() => openChallenge(item)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.title}`}
    >
      <View style={styles.rowIcon}>
        <Trophy color={colors.primary} size={18} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.challengeType === 'target' ? `${item.targetValue} true pints` : 'Leaderboard'} - {formatChallengeWindow(item)}
        </Text>
        {item.winnerTrophyEnabled ? (
          <Text style={styles.rowAccent} numberOfLines={1}>Winner trophy: {item.winnerTrophyTitle}</Text>
        ) : null}
        {item.archivedAt ? (
          <Text style={styles.rowDanger} numberOfLines={1}>Archived</Text>
        ) : null}
      </View>
      <Edit3 color={colors.textMuted} size={17} />
    </Pressable>
  ), []);

  const renderBeer = useCallback(({ item }: { item: AdminBeverage }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={() => openBeer(item)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
    >
      <View style={styles.rowIcon}>
        <Beer color={colors.primary} size={18} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowMeta}>{item.abv}% ABV</Text>
      </View>
      <Edit3 color={colors.textMuted} size={17} />
    </Pressable>
  ), []);

  const renderOfficialPost = useCallback(({ item }: { item: OfficialFeedPost }) => (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Megaphone color={colors.primary} size={18} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={2}>{item.body}</Text>
        {item.challengeSlug ? <Text style={styles.rowAccent}>Challenge: {item.challengeSlug}</Text> : null}
      </View>
    </View>
  ), []);

  const addAction = activeSegment === 'challenges'
    ? openNewChallenge
    : activeSegment === 'beers'
      ? openNewBeer
      : openNewOfficialPost;
  const addActionLabel = activeSegment === 'challenges'
    ? 'Create challenge'
    : activeSegment === 'beers'
      ? 'Add beer'
      : 'Create official post';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={colors.text} size={21} />
        </TouchableOpacity>
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>Admin tools</Text>
          <Text style={styles.screenSubtitle}>Official Beerva content</Text>
        </View>
        <View style={styles.iconButtonPlaceholder} />
      </View>

      <View style={styles.segmentedControl}>
        {(['challenges', 'beers', 'official-posts'] as AdminSegment[]).map((segment) => (
          <TouchableOpacity
            key={segment}
            style={[styles.segmentButton, activeSegment === segment ? styles.segmentButtonActive : null]}
            onPress={() => setActiveSegment(segment)}
            accessibilityRole="button"
            accessibilityState={{ selected: activeSegment === segment }}
          >
            <Text style={[styles.segmentText, activeSegment === segment ? styles.segmentTextActive : null]}>
              {segment === 'challenges' ? 'Challenges' : segment === 'beers' ? 'Beers' : 'Official posts'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toolbar}>
        <View>
          <Text style={styles.toolbarTitle}>
            {activeSegment === 'challenges' ? 'Challenges' : activeSegment === 'beers' ? 'Admin beers' : 'Official posts'}
          </Text>
          <Text style={styles.toolbarMeta}>
            {activeSegment === 'challenges' ? challenges.length : activeSegment === 'beers' ? beverages.length : officialPosts.length} total
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={addAction}
          accessibilityRole="button"
          accessibilityLabel={addActionLabel}
        >
          <Plus color={colors.background} size={20} />
        </TouchableOpacity>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : activeSegment === 'challenges' ? (
        <FlatList
          data={challenges}
          keyExtractor={(item) => item.id}
          renderItem={renderChallenge}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, challenges.length === 0 ? styles.emptyContent : null]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll({ refresh: true })} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyCopy}</Text>}
        />
      ) : activeSegment === 'beers' ? (
        <FlatList
          data={beverages}
          keyExtractor={(item) => item.id}
          renderItem={renderBeer}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, beverages.length === 0 ? styles.emptyContent : null]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll({ refresh: true })} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyCopy}</Text>}
        />
      ) : (
        <FlatList
          data={officialPosts}
          keyExtractor={(item) => item.id}
          renderItem={renderOfficialPost}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, officialPosts.length === 0 ? styles.emptyContent : null]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll({ refresh: true })} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyCopy}</Text>}
        />
      )}

      <Modal visible={activeModal !== null} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBlock}>
                <Text style={styles.modalTitle}>
                  {activeModal === 'beer'
                    ? beerDraft.id ? 'Edit beer' : 'Add beer'
                    : activeModal === 'challenge'
                      ? challengeDraft.id ? 'Edit challenge' : 'Create challenge'
                      : 'Create official post'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {activeModal === 'beer'
                    ? 'Ordinary beer catalog entry'
                    : activeModal === 'challenge'
                      ? 'Official true-pint competition'
                      : 'Official Beerva feed announcement'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={closeModal}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Close form"
              >
                <X color={colors.text} size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
            >
              {activeModal === 'beer' ? (
                <>
                  <FormLabel>Name</FormLabel>
                  <FormInput
                    value={beerDraft.name}
                    onChangeText={(name) => setBeerDraft((current) => ({ ...current, name }))}
                    placeholder="Beer name"
                  />
                  <FormLabel>ABV %</FormLabel>
                  <FormInput
                    value={beerDraft.abv}
                    onChangeText={(abv) => setBeerDraft((current) => ({ ...current, abv }))}
                    placeholder="4.6"
                    keyboardType="decimal-pad"
                  />
                </>
              ) : activeModal === 'challenge' ? (
                <>
                  <FormLabel>Title</FormLabel>
                  <FormInput
                    value={challengeDraft.title}
                    onChangeText={(title) => setChallengeDraft((current) => ({ ...current, title }))}
                    placeholder="Summer sprint"
                  />
                  <FormLabel>Description</FormLabel>
                  <FormInput
                    value={challengeDraft.description}
                    onChangeText={(description) => setChallengeDraft((current) => ({ ...current, description }))}
                    placeholder="Describe the challenge"
                    multiline
                  />
                  <FormLabel>Type</FormLabel>
                  <View style={styles.typeControl}>
                    {(['target', 'leaderboard'] as const).map((challengeType) => (
                      <TouchableOpacity
                        key={challengeType}
                        style={[styles.typeButton, challengeDraft.challengeType === challengeType ? styles.typeButtonActive : null]}
                        onPress={() => setChallengeDraft((current) => ({
                          ...current,
                          challengeType,
                          winnerTrophyEnabled: challengeType === 'leaderboard' && current.winnerTrophyEnabled,
                        }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: challengeDraft.challengeType === challengeType }}
                      >
                        <Text style={[styles.typeText, challengeDraft.challengeType === challengeType ? styles.typeTextActive : null]}>
                          {challengeType === 'target' ? 'Target' : 'Leaderboard'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {challengeDraft.challengeType === 'target' ? (
                    <>
                      <FormLabel>Target true pints</FormLabel>
                      <FormInput
                        value={challengeDraft.targetValue}
                        onChangeText={(targetValue) => setChallengeDraft((current) => ({ ...current, targetValue }))}
                        placeholder="15"
                        keyboardType="decimal-pad"
                      />
                    </>
                  ) : null}

                  <FormLabel>Starts at</FormLabel>
                  <FormInput
                    value={challengeDraft.startsAt}
                    onChangeText={(startsAt) => setChallengeDraft((current) => ({ ...current, startsAt }))}
                    placeholder="YYYY-MM-DDTHH:mm"
                  />
                  <FormLabel>Ends at</FormLabel>
                  <FormInput
                    value={challengeDraft.endsAt}
                    onChangeText={(endsAt) => setChallengeDraft((current) => ({ ...current, endsAt }))}
                    placeholder="YYYY-MM-DDTHH:mm"
                  />
                  <FormLabel>Joining closes at</FormLabel>
                  <FormInput
                    value={challengeDraft.joinClosesAt}
                    onChangeText={(joinClosesAt) => setChallengeDraft((current) => ({ ...current, joinClosesAt }))}
                    placeholder="YYYY-MM-DDTHH:mm"
                  />

                  {challengeDraft.challengeType === 'leaderboard' ? (
                    <>
                      <View style={styles.switchRow}>
                        <View style={styles.switchCopy}>
                          <Text style={styles.switchTitle}>Winner trophy</Text>
                          <Text style={styles.switchDescription}>Add a persistent Trophy Cabinet award.</Text>
                        </View>
                        <Switch
                          value={challengeDraft.winnerTrophyEnabled}
                          onValueChange={(winnerTrophyEnabled) => setChallengeDraft((current) => ({
                            ...current,
                            winnerTrophyEnabled,
                          }))}
                          trackColor={{ false: colors.border, true: colors.primaryBorder }}
                          thumbColor={challengeDraft.winnerTrophyEnabled ? colors.primary : colors.textMuted}
                        />
                      </View>
                      {challengeDraft.winnerTrophyEnabled ? (
                        <>
                          <FormLabel>Trophy title</FormLabel>
                          <FormInput
                            value={challengeDraft.winnerTrophyTitle}
                            onChangeText={(winnerTrophyTitle) => setChallengeDraft((current) => ({ ...current, winnerTrophyTitle }))}
                            placeholder="Summer Sprint Champion"
                          />
                          <FormLabel>Trophy description</FormLabel>
                          <FormInput
                            value={challengeDraft.winnerTrophyDescription}
                            onChangeText={(winnerTrophyDescription) => setChallengeDraft((current) => ({ ...current, winnerTrophyDescription }))}
                            placeholder="Won the Summer Sprint leaderboard."
                            multiline
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <FormLabel>Title</FormLabel>
                  <FormInput
                    value={officialPostDraft.title}
                    onChangeText={(title) => setOfficialPostDraft((current) => ({ ...current, title }))}
                    placeholder="Official Beerva announcement"
                  />
                  <FormLabel>Feed body</FormLabel>
                  <FormInput
                    value={officialPostDraft.body}
                    onChangeText={(body) => setOfficialPostDraft((current) => ({ ...current, body }))}
                    placeholder="Tell the beer crew what is happening"
                    multiline
                  />

                  <FormLabel>Optional photo</FormLabel>
                  {selectedOfficialPostImage ? (
                    <>
                      <Image source={{ uri: selectedOfficialPostImage.uri }} style={styles.officialPostPhotoPreview} />
                      <View style={styles.inlineActions}>
                        <TouchableOpacity style={styles.smallActionButton} onPress={chooseOfficialPostPhoto}>
                          <ImagePlus color={colors.primary} size={16} />
                          <Text style={styles.smallActionText}>Replace</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.smallActionButton} onPress={removeOfficialPostPhoto}>
                          <X color={colors.text} size={16} />
                          <Text style={styles.smallActionText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={styles.inlineActions}>
                      <TouchableOpacity style={styles.smallActionButton} onPress={chooseOfficialPostPhoto}>
                        <ImagePlus color={colors.primary} size={16} />
                        <Text style={styles.smallActionText}>Choose photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallActionButton} onPress={takeOfficialPostPhoto}>
                        <Camera color={colors.primary} size={16} />
                        <Text style={styles.smallActionText}>Take photo</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <FormLabel>Select a challenge</FormLabel>
                  <TouchableOpacity
                    style={[styles.challengeChoice, !officialPostDraft.linkedChallengeId ? styles.challengeChoiceActive : null]}
                    onPress={() => selectOfficialPostChallenge(null)}
                  >
                    <Text style={styles.challengeChoiceText}>No linked challenge</Text>
                  </TouchableOpacity>
                  {challenges.filter((challenge) => !challenge.archivedAt).map((challenge) => (
                    <TouchableOpacity
                      key={challenge.id}
                      style={[styles.challengeChoice, officialPostDraft.linkedChallengeId === challenge.id ? styles.challengeChoiceActive : null]}
                      onPress={() => selectOfficialPostChallenge(challenge)}
                    >
                      <Text style={styles.challengeChoiceText}>{challenge.title}</Text>
                    </TouchableOpacity>
                  ))}

                  <View style={styles.switchRow}>
                    <View style={styles.switchCopy}>
                      <Text style={styles.switchTitle}>Send in-app notification</Text>
                      <Text style={styles.switchDescription}>Add this announcement to every user's notification inbox.</Text>
                    </View>
                    <Switch
                      value={officialPostDraft.sendInAppNotification}
                      onValueChange={(sendInAppNotification) => setOfficialPostDraft((current) => ({
                        ...current,
                        sendInAppNotification,
                        sendPushNotification: sendInAppNotification ? current.sendPushNotification : false,
                      }))}
                      trackColor={{ false: colors.border, true: colors.primaryBorder }}
                      thumbColor={officialPostDraft.sendInAppNotification ? colors.primary : colors.textMuted}
                    />
                  </View>

                  {officialPostDraft.sendInAppNotification ? (
                    <>
                      <FormLabel>Notification body</FormLabel>
                      <FormInput
                        value={officialPostDraft.notificationBody}
                        onChangeText={(notificationBody) => setOfficialPostDraft((current) => ({ ...current, notificationBody }))}
                        placeholder="Short inbox copy"
                        multiline
                      />
                      <View style={styles.switchRow}>
                        <View style={styles.switchCopy}>
                          <Text style={styles.switchTitle}>Send push notification</Text>
                          <Text style={styles.switchDescription}>Notify subscribed devices too.</Text>
                        </View>
                        <Switch
                          value={officialPostDraft.sendPushNotification}
                          onValueChange={(sendPushNotification) => setOfficialPostDraft((current) => ({ ...current, sendPushNotification }))}
                          trackColor={{ false: colors.border, true: colors.primaryBorder }}
                          thumbColor={officialPostDraft.sendPushNotification ? colors.primary : colors.textMuted}
                        />
                      </View>
                    </>
                  ) : null}

                  {officialPostDraft.sendPushNotification ? (
                    <>
                      <FormLabel>Push title</FormLabel>
                      <FormInput
                        value={officialPostDraft.pushTitle}
                        onChangeText={(pushTitle) => setOfficialPostDraft((current) => ({ ...current, pushTitle }))}
                        placeholder="New challenge"
                      />
                      <FormLabel>Push body</FormLabel>
                      <FormInput
                        value={officialPostDraft.pushBody}
                        onChangeText={(pushBody) => setOfficialPostDraft((current) => ({ ...current, pushBody }))}
                        placeholder="Short device notification copy"
                        multiline
                      />
                    </>
                  ) : null}
                </>
              )}

              {formError ? <Text style={styles.formError}>{formError}</Text> : null}
              <AppButton
                label={
                  activeModal === 'beer'
                    ? 'Save Beer'
                    : activeModal === 'challenge'
                      ? 'Save Challenge'
                      : 'Publish Official Post'
                }
                onPress={
                  activeModal === 'beer'
                    ? handleSaveBeer
                    : activeModal === 'challenge'
                      ? handleSaveChallenge
                      : handlePublishOfficialPost
                }
                loading={saving}
                icon={activeModal === 'beer'
                  ? <Beer color={colors.background} size={18} />
                  : activeModal === 'challenge'
                    ? <ShieldCheck color={colors.background} size={18} />
                    : <Megaphone color={colors.background} size={18} />}
              />
              {activeModal === 'challenge' && canArchiveSelectedChallenge ? (
                <AppButton
                  label="Archive Challenge"
                  onPress={handleArchiveChallenge}
                  loading={saving}
                  variant="danger"
                  icon={<Archive color={colors.danger} size={18} />}
                />
              ) : null}
              {activeModal === 'challenge' && canRestoreSelectedChallenge ? (
                <AppButton
                  label="Restore Challenge"
                  onPress={handleRestoreChallenge}
                  loading={saving}
                  variant="secondary"
                  icon={<RotateCcw color={colors.text} size={18} />}
                />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <Text style={styles.formLabel}>{children}</Text>
);

type FormInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  multiline?: boolean;
};

const FormInput = ({ value, onChangeText, placeholder, keyboardType = 'default', multiline = false }: FormInputProps) => (
  <TextInput
    style={[styles.input, multiline ? styles.inputMultiline : null]}
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={colors.textMuted}
    keyboardType={keyboardType}
    multiline={multiline}
    textAlignVertical={multiline ? 'top' : 'center'}
  />
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    gap: 12,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  iconButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  screenTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  screenSubtitle: {
    ...typography.tiny,
    marginTop: 1,
  },
  segmentedControl: {
    minHeight: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 16,
    flexDirection: 'row',
  },
  segmentButton: {
    flex: 1,
    minHeight: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primarySoft,
  },
  segmentText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: colors.primary,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbarTitle: {
    ...typography.h3,
  },
  toolbarMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginHorizontal: 16,
    marginTop: 6,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: spacing.sm,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  row: {
    minHeight: 68,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    ...shadows.card,
  },
  rowPressed: {
    opacity: 0.78,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  rowMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  rowAccent: {
    ...typography.tiny,
    color: colors.primary,
    marginTop: 3,
  },
  rowDanger: {
    ...typography.tiny,
    color: colors.danger,
    marginTop: 3,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
    padding: 16,
  },
  modalSheet: {
    maxHeight: '92%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    padding: 16,
    gap: spacing.sm,
    ...shadows.raised,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
  },
  modalSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  formContent: {
    paddingTop: 8,
    paddingBottom: 2,
    gap: 8,
  },
  formLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
    marginTop: 4,
  },
  input: {
    ...typography.body,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 13,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12,
  },
  officialPostPhotoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.cardMuted,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallActionButton: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallActionText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
  },
  challengeChoice: {
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  challengeChoiceActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  challengeChoiceText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
  },
  typeControl: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    padding: 3,
    flexDirection: 'row',
  },
  typeButton: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.primarySoft,
  },
  typeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  typeTextActive: {
    color: colors.primary,
  },
  switchRow: {
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
  },
  switchTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  switchDescription: {
    ...typography.caption,
    marginTop: 2,
  },
  formError: {
    ...typography.caption,
    color: colors.danger,
    marginVertical: 4,
  },
});
