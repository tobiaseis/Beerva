import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Beer, CheckCircle2, ChevronDown, Minus, Plus, X } from 'lucide-react-native';

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

type BeerDraftFormProps = {
  draft: BeerDraft;
  onChange: (draft: BeerDraft) => void;
  onSubmit: (draft?: BeerDraft) => void;
  submitLabel: string;
  loading?: boolean;
};

const COMMON_VOLUMES = ['33cl', '50cl', 'Pint'];
const MORE_VOLUMES = VOLUMES.filter((volume) => !COMMON_VOLUMES.includes(volume));

export const BeerDraftForm = ({
  draft,
  onChange,
  onSubmit,
  submitLabel,
  loading = false,
}: BeerDraftFormProps) => {
  const { catalog, options } = useBeverageCatalog();
  const [autoAddingName, setAutoAddingName] = useState<string | null>(null);
  const [sizeSheetVisible, setSizeSheetVisible] = useState(false);

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
    updateDraft(defaultVolume ? { beerName, volume: defaultVolume } : { beerName });
  };

  const selectBeverageName = (beerName: string) => {
    const defaultVolume = getBeverageDefaultVolume(beerName, catalog);
    const nextDraft = defaultVolume ? { ...draft, beerName, volume: defaultVolume } : { ...draft, beerName };

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

  useEffect(() => {
    if (hideDrinkControls || volumeLocked) {
      setSizeSheetVisible(false);
    }
  }, [hideDrinkControls, volumeLocked]);

  const selectVolume = (volume: string) => {
    updateDraft({ volume });
    setSizeSheetVisible(false);
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
        placeholder="What are you drinking?"
        icon={<Beer color={colors.textMuted} size={20} />}
        getSearchText={(beverageName) => getBeverageOptionSearchText(beverageName, catalog)}
      />

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

          <Text style={styles.sectionLabel}>Quantity</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity
              style={styles.quantityBtn}
              onPress={() => updateDraft({ quantity: Math.max(1, draft.quantity - 1) })}
              activeOpacity={0.76}
              accessibilityRole="button"
              accessibilityLabel="Decrease quantity"
            >
              <Minus color={colors.primary} size={22} />
            </TouchableOpacity>

            <Text style={styles.quantityText}>{draft.quantity}</Text>

            <TouchableOpacity
              style={styles.quantityBtn}
              onPress={() => updateDraft({ quantity: draft.quantity + 1 })}
              activeOpacity={0.76}
              accessibilityRole="button"
              accessibilityLabel="Increase quantity"
            >
              <Plus color={colors.primary} size={22} />
            </TouchableOpacity>
          </View>

          <AppButton label={submitLabel} onPress={() => onSubmit()} loading={loading} />

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
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 8,
    marginBottom: spacing.sm,
  },
  quantityBtn: {
    padding: 12,
    backgroundColor: colors.glass,
    borderRadius: radius.sm,
  },
  quantityText: {
    ...typography.h1,
    color: colors.text,
    width: 60,
    textAlign: 'center',
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
