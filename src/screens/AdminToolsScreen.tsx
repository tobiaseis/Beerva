import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { ArrowLeft, Beer, Edit3, Plus, ShieldCheck, Trophy, X } from 'lucide-react-native';

import { AppButton } from '../components/AppButton';
import {
  AdminBeverage,
  AdminChallenge,
  fetchAdminBeverages,
  fetchAdminChallenges,
  saveAdminBeverage,
  saveAdminChallenge,
} from '../lib/adminApi';
import {
  AdminBeerDraft,
  AdminChallengeDraft,
  adminBeverageToDraft,
  adminChallengeToDraft,
  createEmptyBeerDraft,
  createEmptyChallengeDraft,
  fromLocalDateTimeInput,
  validateBeerDraft,
  validateChallengeDraft,
} from '../lib/adminTools';
import { useBeverageCatalog } from '../lib/beverageCatalogContext';
import { getBeverageCatalogItem } from '../lib/sessionBeers';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type AdminSegment = 'challenges' | 'beers';
type ActiveModal = 'challenge' | 'beer' | null;

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [beerDraft, setBeerDraft] = useState<AdminBeerDraft>(createEmptyBeerDraft);
  const [challengeDraft, setChallengeDraft] = useState<AdminChallengeDraft>(createEmptyChallengeDraft);

  const loadAll = useCallback(async ({ refresh = false } = {}) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setErrorMessage(null);
    try {
      const [challengeRows, beverageRows] = await Promise.all([
        fetchAdminChallenges(),
        fetchAdminBeverages(),
      ]);
      setChallenges(challengeRows);
      setBeverages(beverageRows);
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
    setChallengeDraft(createEmptyChallengeDraft());
    setFormError(null);
    setActiveModal('challenge');
  };

  const openChallenge = (challenge: AdminChallenge) => {
    setChallengeDraft(adminChallengeToDraft(challenge));
    setFormError(null);
    setActiveModal('challenge');
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
      setActiveModal(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save challenge.');
    } finally {
      setSaving(false);
    }
  };

  const emptyCopy = useMemo(() => (
    activeSegment === 'challenges' ? 'No challenges yet.' : 'No admin-added beers yet.'
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
        {(['challenges', 'beers'] as AdminSegment[]).map((segment) => (
          <TouchableOpacity
            key={segment}
            style={[styles.segmentButton, activeSegment === segment ? styles.segmentButtonActive : null]}
            onPress={() => setActiveSegment(segment)}
            accessibilityRole="button"
            accessibilityState={{ selected: activeSegment === segment }}
          >
            <Text style={[styles.segmentText, activeSegment === segment ? styles.segmentTextActive : null]}>
              {segment === 'challenges' ? 'Challenges' : 'Beers'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toolbar}>
        <View>
          <Text style={styles.toolbarTitle}>{activeSegment === 'challenges' ? 'Challenges' : 'Admin beers'}</Text>
          <Text style={styles.toolbarMeta}>
            {activeSegment === 'challenges' ? challenges.length : beverages.length} total
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={activeSegment === 'challenges' ? openNewChallenge : openNewBeer}
          accessibilityRole="button"
          accessibilityLabel={activeSegment === 'challenges' ? 'Create challenge' : 'Add beer'}
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
      ) : (
        <FlatList
          data={beverages}
          keyExtractor={(item) => item.id}
          renderItem={renderBeer}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.listContent, beverages.length === 0 ? styles.emptyContent : null]}
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
                    : challengeDraft.id ? 'Edit challenge' : 'Create challenge'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {activeModal === 'beer' ? 'Ordinary beer catalog entry' : 'Official true-pint competition'}
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
              ) : (
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
              )}

              {formError ? <Text style={styles.formError}>{formError}</Text> : null}
              <AppButton
                label={activeModal === 'beer' ? 'Save Beer' : 'Save Challenge'}
                onPress={activeModal === 'beer' ? handleSaveBeer : handleSaveChallenge}
                loading={saving}
                icon={activeModal === 'beer'
                  ? <Beer color={colors.background} size={18} />
                  : <ShieldCheck color={colors.background} size={18} />}
              />
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
