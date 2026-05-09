import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Beer, Minus, Plus } from 'lucide-react-native';

import { AutocompleteInput } from './AutocompleteInput';
import { AppButton } from './AppButton';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { BeerDraft, BEER_OPTIONS, VOLUMES } from '../lib/sessionBeers';

type BeerDraftFormProps = {
  draft: BeerDraft;
  onChange: (draft: BeerDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
  loading?: boolean;
};

export const BeerDraftForm = ({
  draft,
  onChange,
  onSubmit,
  submitLabel,
  loading = false,
}: BeerDraftFormProps) => {
  const updateDraft = (patch: Partial<BeerDraft>) => {
    onChange({ ...draft, ...patch });
  };

  return (
    <View style={styles.container}>
      <AutocompleteInput
        value={draft.beerName}
        onChangeText={(beerName) => updateDraft({ beerName })}
        data={BEER_OPTIONS}
        placeholder="What are you drinking?"
        icon={<Beer color={colors.textMuted} size={20} />}
      />

      <Text style={styles.sectionLabel}>Size</Text>
      <View style={styles.volumeRow}>
        {VOLUMES.map((volume) => (
          <TouchableOpacity
            key={volume}
            style={[styles.volumeButton, draft.volume === volume && styles.volumeButtonActive]}
            onPress={() => updateDraft({ volume })}
            activeOpacity={0.76}
          >
            <Text style={[styles.volumeText, draft.volume === volume && styles.volumeTextActive]}>{volume}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Quantity</Text>
      <View style={styles.quantityContainer}>
        <TouchableOpacity
          style={styles.quantityBtn}
          onPress={() => updateDraft({ quantity: Math.max(1, draft.quantity - 1) })}
          activeOpacity={0.76}
        >
          <Minus color={colors.primary} size={22} />
        </TouchableOpacity>

        <Text style={styles.quantityText}>{draft.quantity}</Text>

        <TouchableOpacity
          style={styles.quantityBtn}
          onPress={() => updateDraft({ quantity: draft.quantity + 1 })}
          activeOpacity={0.76}
        >
          <Plus color={colors.primary} size={22} />
        </TouchableOpacity>
      </View>

      <AppButton label={submitLabel} onPress={onSubmit} loading={loading} />
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
  volumeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  volumeButton: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    minHeight: 46,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  volumeText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  volumeTextActive: {
    color: colors.background,
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
});
