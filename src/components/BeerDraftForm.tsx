import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AlertCircle, CheckCircle2, ChevronDown, Minus, Plus, Search, X } from 'lucide-react-native';

import { AutocompleteInput } from './AutocompleteInput';
import { AppButton } from './AppButton';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import {
  BeerDraft,
  getBeverageDefaultVolume,
  getBeverageOptionSearchText,
  isBeverageAutoAdded,
  isBeverageVolumeLocked,
  VOLUMES,
} from '../lib/sessionBeers';
import { useBeverageCatalog } from '../lib/beverageCatalogContext';
import {
  BeverageSubmissionCategory,
  getBeverageSubmissionFallbackAbv,
  isUnknownBeverageName,
  parseBeverageSubmissionAbv,
  validateBeverageSubmissionDraft,
} from '../lib/beverageSubmissions';

type BeerDraftFormProps = {
  draft: BeerDraft;
  onChange: (draft: BeerDraft) => void;
  onSubmit: (draft?: BeerDraft) => void;
  onSubmitUnknown?: (input: {
    draft: BeerDraft;
    category: BeverageSubmissionCategory;
    abv: number;
  }) => void;
  submitLabel: string;
  loading?: boolean;
};

const COMMON_VOLUMES = ['33cl', '50cl', 'Pint'];
const MORE_VOLUMES = VOLUMES.filter((volume) => !COMMON_VOLUMES.includes(volume));

export const BeerDraftForm = ({
  draft,
  onChange,
  onSubmit,
  onSubmitUnknown,
  submitLabel,
  loading = false,
}: BeerDraftFormProps) => {
  const { catalog, options } = useBeverageCatalog();
  const [autoAddingName, setAutoAddingName] = useState<string | null>(null);
  const [sizeSheetVisible, setSizeSheetVisible] = useState(false);
  const [unknownFormVisible, setUnknownFormVisible] = useState(false);
  const [unknownCategory, setUnknownCategory] = useState<BeverageSubmissionCategory>('beer');
  const [unknownAbv, setUnknownAbv] = useState('');
  const [unknownError, setUnknownError] = useState<string | null>(null);

  useEffect(() => {
    const normalizedAutoAddingName = autoAddingName?.trim().toLowerCase();
    const normalizedDraftName = draft.beerName.trim().toLowerCase();
    if (!normalizedAutoAddingName || normalizedAutoAddingName === normalizedDraftName) return;
    setAutoAddingName(null);
  }, [autoAddingName, draft.beerName]);

  useEffect(() => {
    if (!loading) {
      setAutoAddingName(null);
    }
  }, [loading]);

  const updateDraft = (patch: Partial<BeerDraft>) => {
    setAutoAddingName(null);
    onChange({ ...draft, ...patch });
  };

  const updateBeverageName = (beerName: string) => {
    const defaultVolume = getBeverageDefaultVolume(beerName, catalog);
    setUnknownError(null);
    if (!isUnknownBeverageName(beerName, catalog)) {
      setUnknownFormVisible(false);
    }
    updateDraft(defaultVolume ? { beerName, volume: defaultVolume } : { beerName });
  };

  const selectBeverageName = (beerName: string) => {
    const defaultVolume = getBeverageDefaultVolume(beerName, catalog);
    const nextDraft = defaultVolume ? { ...draft, beerName, volume: defaultVolume } : { ...draft, beerName };
    setUnknownFormVisible(false);
    setUnknownError(null);

    if (isBeverageAutoAdded(beerName, catalog)) {
      setAutoAddingName(beerName);
      onChange(nextDraft);
      onSubmit(nextDraft);
      return;
    }

    setAutoAddingName(null);
    onChange(nextDraft);
  };

  const volumeLocked = isBeverageVolumeLocked(draft.beerName, catalog);
  const lockedVolume = getBeverageDefaultVolume(draft.beerName, catalog);
  const selectedVolume = volumeLocked ? lockedVolume || draft.volume : draft.volume;
  const hideDrinkControls = Boolean(autoAddingName && isBeverageAutoAdded(draft.beerName, catalog));
  const unknownName = isUnknownBeverageName(draft.beerName, catalog);
  const canSubmitUnknown = Boolean(onSubmitUnknown && unknownName);

  useEffect(() => {
    if (hideDrinkControls || volumeLocked) {
      setSizeSheetVisible(false);
    }
  }, [hideDrinkControls, volumeLocked]);

  const selectVolume = (volume: string) => {
    updateDraft({ volume });
    setSizeSheetVisible(false);
  };

  const submitUnknown = () => {
    const validationError = validateBeverageSubmissionDraft({
      name: draft.beerName,
      category: unknownCategory,
      abv: unknownAbv,
    });

    if (validationError) {
      setUnknownError(validationError);
      return;
    }

    const abv = parseBeverageSubmissionAbv(unknownAbv);
    if (abv === null) {
      setUnknownError('ABV must be between 0 and 100.');
      return;
    }

    setUnknownError(null);
    onSubmitUnknown?.({
      draft,
      category: unknownCategory,
      abv,
    });
  };

  const renderVolumeOption = (volume: string) => {
    const selected = selectedVolume === volume;

    return (
      <TouchableOpacity
        key={volume}
        style={[styles.sizeOption, selected ? styles.sizeOptionActive : null]}
        onPress={() => selectVolume(volume)}
        activeOpacity={0.76}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Use ${volume}`}
      >
        <Text style={[styles.sizeOptionText, selected ? styles.sizeOptionTextActive : null]}>
          {volume}
        </Text>
        {selected ? <CheckCircle2 color={colors.background} size={16} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <AutocompleteInput
        value={draft.beerName}
        onChangeText={updateBeverageName}
        onSelectItem={selectBeverageName}
        data={options}
        placeholder="Search for your drink"
        icon={<Search color={colors.primary} size={20} />}
        getSearchText={(beverageName) => getBeverageOptionSearchText(beverageName, catalog)}
        inputWrapperStyle={styles.drinkSearchWrapper}
        inputStyle={styles.drinkSearchInput}
      />

      {canSubmitUnknown && !unknownFormVisible ? (
        <TouchableOpacity
          style={styles.unknownCta}
          onPress={() => setUnknownFormVisible(true)}
          activeOpacity={0.76}
          accessibilityRole="button"
          accessibilityLabel="Add this as a new drink"
        >
          <AlertCircle color={colors.primary} size={18} />
          <Text style={styles.unknownCtaText}>Add as new drink</Text>
        </TouchableOpacity>
      ) : null}

      {!hideDrinkControls && (
        <>
          <View style={styles.sizeSummary}>
            <View style={styles.sizeSummaryText}>
              <Text style={styles.sizeLabel}>Size</Text>
              <Text style={styles.sizeValue}>{selectedVolume} selected</Text>
            </View>

            {!volumeLocked ? (
              <TouchableOpacity
                style={styles.sizeChangeButton}
                onPress={() => setSizeSheetVisible(true)}
                activeOpacity={0.76}
                accessibilityRole="button"
                accessibilityLabel="Change drink size"
              >
                <Text style={styles.sizeChangeText}>Change size</Text>
                <ChevronDown color={colors.primary} size={16} />
              </TouchableOpacity>
            ) : (
              <Text style={styles.sizeLockedText}>Auto</Text>
            )}
          </View>

          <View style={styles.quantityRow}>
            <Text style={styles.quantityInlineLabel}>Qty</Text>
            <View style={styles.quantityContainer}>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => updateDraft({ quantity: Math.max(1, draft.quantity - 1) })}
                activeOpacity={0.76}
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
              >
                <Minus color={colors.primary} size={18} />
              </TouchableOpacity>

              <Text style={styles.quantityText}>{draft.quantity}</Text>

              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => updateDraft({ quantity: draft.quantity + 1 })}
                activeOpacity={0.76}
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
              >
                <Plus color={colors.primary} size={18} />
              </TouchableOpacity>
            </View>
          </View>

          <AppButton label={submitLabel} onPress={() => onSubmit()} loading={loading} />

          {canSubmitUnknown && unknownFormVisible ? (
            <View style={styles.unknownPanel}>
              <Text style={styles.unknownTitle}>New drink details</Text>
              <View style={styles.typeControl}>
                {(['beer', 'wine', 'drink'] as const).map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.typeButton, unknownCategory === category ? styles.typeButtonActive : null]}
                    onPress={() => {
                      setUnknownCategory(category);
                      setUnknownError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: unknownCategory === category }}
                  >
                    <Text style={[styles.typeText, unknownCategory === category ? styles.typeTextActive : null]}>
                      {category === 'beer' ? 'Beer' : category === 'wine' ? 'Wine' : 'Drink'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.sizeLabel}>ABV</Text>
              <View style={styles.abvInputRow}>
                <TextInput
                  style={styles.abvInput}
                  value={unknownAbv}
                  onChangeText={(value) => {
                    setUnknownAbv(value);
                    setUnknownError(null);
                  }}
                  placeholder={`${getBeverageSubmissionFallbackAbv(unknownCategory)}`}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.abvSuffix}>%</Text>
              </View>
              {unknownError ? <Text style={styles.unknownError}>{unknownError}</Text> : null}
              <AppButton label="Submit New Drink" onPress={submitUnknown} loading={loading} />
            </View>
          ) : null}

          <Modal
            visible={sizeSheetVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setSizeSheetVisible(false)}
          >
            <View style={styles.sizeSheetBackdrop}>
              <View style={styles.sizeSheet}>
                <View style={styles.sizeSheetHeader}>
                  <Text style={styles.sizeSheetTitle}>Choose size</Text>
                  <TouchableOpacity
                    style={styles.sizeSheetClose}
                    onPress={() => setSizeSheetVisible(false)}
                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close size chooser"
                  >
                    <X color={colors.text} size={20} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.sizeGroupLabel}>Common</Text>
                <View style={styles.sizeOptionGrid}>
                  {COMMON_VOLUMES.map(renderVolumeOption)}
                </View>

                <Text style={styles.sizeGroupLabel}>More sizes</Text>
                <View style={styles.sizeOptionGrid}>
                  {MORE_VOLUMES.map(renderVolumeOption)}
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 8,
  },
  drinkSearchWrapper: {
    height: 58,
    backgroundColor: colors.surfaceRaised,
    borderColor: 'rgba(247, 181, 58, 0.22)',
  },
  drinkSearchInput: {
    fontWeight: '700',
  },
  unknownCta: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unknownCtaText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '900',
  },
  unknownPanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    padding: 12,
    gap: 10,
  },
  unknownTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '900',
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
    backgroundColor: colors.primary,
  },
  typeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  typeTextActive: {
    color: colors.background,
  },
  abvInputRow: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  abvInput: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    paddingVertical: 0,
  },
  abvSuffix: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '800',
  },
  unknownError: {
    ...typography.caption,
    color: colors.danger,
  },
  sizeSummary: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sizeSummaryText: {
    flex: 1,
    minWidth: 0,
  },
  sizeLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  sizeValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
    marginTop: 2,
  },
  sizeChangeButton: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sizeChangeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  sizeLockedText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  quantityInlineLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  quantityContainer: {
    minHeight: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceRaised,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  quantityBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  quantityText: {
    ...typography.body,
    color: colors.text,
    minWidth: 34,
    textAlign: 'center',
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  sizeSheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },
  sizeSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    gap: 12,
  },
  sizeSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sizeSheetTitle: {
    ...typography.h3,
    color: colors.text,
  },
  sizeSheetClose: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sizeGroupLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
    marginTop: 4,
  },
  sizeOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sizeOption: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 92,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sizeOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sizeOptionText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
    textAlign: 'center',
  },
  sizeOptionTextActive: {
    color: colors.background,
  },
});
