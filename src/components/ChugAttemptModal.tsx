import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Beer, Search, Timer, UserCheck, X } from 'lucide-react-native';

import { AppButton } from './AppButton';
import { AutocompleteInput } from './AutocompleteInput';
import { getBeverageOptionSearchText, getBeerLine, SessionBeer } from '../lib/sessionBeers';
import { formatChugDuration, getChugBeerOptions } from '../lib/chugAttempts';
import { useBeverageCatalog } from '../lib/beverageCatalogContext';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const recordingAngleImage = require('../../assets/person_drinking.png');

const chugSetupSteps = [
  'Choose the 33cl bottled beer you want to chug.',
  'Find a mate to verify and record from the angle shown.',
  'Keep your face and bottle visible, then chug once the camera is rolling.',
];

type MutualFollower = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

type AnalysisPreview = {
  durationMs: number;
  confidenceScore?: number | null;
};

type ChugAttemptModalProps = {
  visible: boolean;
  mutualFollowers: MutualFollower[];
  selectedBeer: SessionBeer | null;
  selectedVerifierId: string | null;
  analysisPreview: AnalysisPreview | null;
  needsManualTiming: boolean;
  analyzing: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreateBeer: (beerName: string) => void;
  onSelectVerifier: (verifierId: string) => void;
  onRecord: () => void;
  onRetry: () => void;
  onAccept: () => void;
  onSubmitManualTiming: () => void;
};

export const ChugAttemptModal = ({
  visible,
  mutualFollowers,
  selectedBeer,
  selectedVerifierId,
  analysisPreview,
  needsManualTiming,
  analyzing,
  busy,
  error,
  onClose,
  onCreateBeer,
  onSelectVerifier,
  onRecord,
  onRetry,
  onAccept,
  onSubmitManualTiming,
}: ChugAttemptModalProps) => {
  const { catalog } = useBeverageCatalog();
  const [beerSearch, setBeerSearch] = useState('');
  const [verifierSearch, setVerifierSearch] = useState('');
  const chugBeerOptions = useMemo(() => getChugBeerOptions(catalog), [catalog]);
  const selectedVerifier = mutualFollowers.find((follower) => follower.id === selectedVerifierId) || null;
  const normalizedVerifierSearch = verifierSearch.trim().toLowerCase();
  const filteredFollowers = mutualFollowers
    .filter((follower) => (
      !normalizedVerifierSearch
      || (follower.username || '').toLowerCase().includes(normalizedVerifierSearch)
    ))
    .slice(0, 20);
  const canRecord = Boolean(selectedBeer && selectedVerifier && !busy);
  const canAccept = Boolean(analysisPreview && selectedBeer && selectedVerifier && !busy);
  const canSubmitManualTiming = Boolean(needsManualTiming && selectedBeer && selectedVerifier && !busy);

  useEffect(() => {
    if (!visible) return;
    setBeerSearch('');
    setVerifierSearch('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>33cl bottle challenge</Text>
              <Text style={styles.title}>How fast can you chug?</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} disabled={busy}>
              <X color={colors.text} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.guidancePanel}>
              <Image
                source={recordingAngleImage}
                style={styles.guidanceImage}
                resizeMode="cover"
                accessibilityLabel="Example of filming a drinker and bottle from a slight side angle"
              />
              <View style={styles.guidanceCopy}>
                <Text style={styles.guidanceTitle}>Best recording angle</Text>
                <View style={styles.stepList}>
                  {chugSetupSteps.map((step, index) => (
                    <View key={step} style={styles.stepRow}>
                      <Text style={styles.stepNumber}>{index + 1}</Text>
                      <Text style={styles.stepText}>{step}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.ruleText}>Chugs are 33cl bottled beers only for now.</Text>

            <Text style={styles.sectionTitle}>Beer</Text>
            {selectedBeer ? (
              <View style={[styles.optionRow, styles.optionRowActive]}>
                <Beer color={colors.background} size={18} />
                <View style={styles.optionText}>
                  <Text style={[styles.optionTitle, styles.optionTitleActive]}>{selectedBeer.beer_name}</Text>
                  <Text style={[styles.optionMeta, styles.optionMetaActive]}>{getBeerLine(selectedBeer)}</Text>
                </View>
              </View>
            ) : (
              <AutocompleteInput
                value={beerSearch}
                onChangeText={setBeerSearch}
                onSelectItem={onCreateBeer}
                data={chugBeerOptions}
                placeholder="Search bottled beer"
                icon={<Beer color={colors.textMuted} size={20} />}
                getSearchText={(beerName) => getBeverageOptionSearchText(beerName, catalog)}
              />
            )}

            <Text style={styles.sectionTitle}>Verifier</Text>
            {mutualFollowers.length === 0 ? (
              <View style={styles.emptyBox}>
                <UserCheck color={colors.textMuted} size={22} />
                <Text style={styles.emptyText}>Add a mutual follower before chug verification.</Text>
              </View>
            ) : (
              <>
                <View style={styles.searchBox}>
                  <Search color={colors.textMuted} size={18} />
                  <TextInput
                    value={verifierSearch}
                    onChangeText={setVerifierSearch}
                    placeholder="Search mutual followers"
                    placeholderTextColor={colors.textMuted}
                    style={styles.searchInput}
                  />
                </View>
                {filteredFollowers.map((follower) => (
                  <TouchableOpacity
                    key={follower.id}
                    style={[styles.optionRow, selectedVerifierId === follower.id ? styles.optionRowActive : null]}
                    onPress={() => onSelectVerifier(follower.id)}
                    activeOpacity={0.76}
                  >
                    <Image
                      source={{ uri: follower.avatar_url || `https://i.pravatar.cc/150?u=${follower.id}` }}
                      style={styles.avatar}
                    />
                    <Text style={[styles.optionTitle, selectedVerifierId === follower.id ? styles.optionTitleActive : null]}>
                      {follower.username || 'Someone'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {analysisPreview ? (
              <View style={styles.resultBox}>
                <Timer color={colors.primary} size={24} />
                <View style={styles.optionText}>
                  <Text style={styles.resultValue}>{formatChugDuration(analysisPreview.durationMs)}</Text>
                  <Text style={styles.resultMeta}>
                    Unverified until {selectedVerifier?.username || 'your mate'} reviews it
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {analysisPreview ? (
              <>
                <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} disabled={busy}>
                  <Text style={styles.secondaryButtonText}>Retry</Text>
                </TouchableOpacity>
                <View style={styles.primaryWrap}>
                  <AppButton label="Accept Attempt" onPress={onAccept} loading={busy} disabled={!canAccept} />
                </View>
              </>
            ) : needsManualTiming ? (
              <>
                <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} disabled={busy}>
                  <Text style={styles.secondaryButtonText}>Try again</Text>
                </TouchableOpacity>
                <View style={styles.primaryWrap}>
                  <AppButton
                    label="Send for manual timing"
                    onPress={onSubmitManualTiming}
                    loading={busy}
                    disabled={!canSubmitManualTiming}
                  />
                </View>
              </>
            ) : (
              <AppButton label="Record Chug" onPress={onRecord} loading={busy} disabled={!canRecord} />
            )}
          </View>

          {analyzing ? (
            <View style={styles.analysisOverlay}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.analysisTitle}>Your chug is being analyzed. Be patient...</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '92%',
    position: 'relative',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  kicker: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  content: {
    padding: 18,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  guidancePanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  guidanceImage: {
    width: '100%',
    height: 220,
  },
  guidanceCopy: {
    gap: 4,
    padding: 12,
  },
  guidanceTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  stepList: {
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontWeight: '900',
    lineHeight: 22,
    textAlign: 'center',
  },
  stepText: {
    flex: 1,
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  ruleText: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  emptyBox: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  optionRow: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  optionRowActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  optionTitleActive: {
    color: colors.background,
  },
  optionMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  optionMetaActive: {
    color: colors.background,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  searchBox: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  resultBox: {
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultValue: {
    ...typography.h2,
    color: colors.text,
  },
  resultMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  footer: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  primaryWrap: {
    flex: 1,
  },
  analysisOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: colors.overlay,
  },
  analysisTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
});
