import React from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Beer, Timer, UserCheck, X } from 'lucide-react-native';

import { AppButton } from './AppButton';
import { BeerDraftForm } from './BeerDraftForm';
import { BeerDraft, getBeerLine, SessionBeer } from '../lib/sessionBeers';
import { formatChugDuration } from '../lib/chugAttempts';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const recordingAngleImage = require('../../assets/person_drinking_beer.png');

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
  eligibleBeers: SessionBeer[];
  mutualFollowers: MutualFollower[];
  beerDraft: BeerDraft;
  selectedBeerId: string | null;
  selectedVerifierId: string | null;
  analysisPreview: AnalysisPreview | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onBeerDraftChange: (draft: BeerDraft) => void;
  onSelectBeer: (beerId: string) => void;
  onCreateBeer: (draft?: BeerDraft) => void;
  onSelectVerifier: (verifierId: string) => void;
  onRecord: () => void;
  onRetry: () => void;
  onAccept: () => void;
};

export const ChugAttemptModal = ({
  visible,
  eligibleBeers,
  mutualFollowers,
  beerDraft,
  selectedBeerId,
  selectedVerifierId,
  analysisPreview,
  busy,
  error,
  onClose,
  onBeerDraftChange,
  onSelectBeer,
  onCreateBeer,
  onSelectVerifier,
  onRecord,
  onRetry,
  onAccept,
}: ChugAttemptModalProps) => {
  const selectedBeer = eligibleBeers.find((beer) => beer.id === selectedBeerId) || null;
  const selectedVerifier = mutualFollowers.find((follower) => follower.id === selectedVerifierId) || null;
  const canRecord = Boolean(selectedBeer && selectedVerifier && !busy);
  const canAccept = Boolean(analysisPreview && selectedBeer && selectedVerifier && !busy);

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
                <Text style={styles.guidanceText}>
                  Keep the face and bottle visible. Film from a slight side angle in good lighting.
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Choose beer</Text>
            {eligibleBeers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Beer color={colors.textMuted} size={22} />
                <Text style={styles.emptyText}>Chugs are 33cl bottled beers only for now.</Text>
              </View>
            ) : (
              eligibleBeers.map((beer) => (
                <TouchableOpacity
                  key={beer.id || `${beer.beer_name}-${beer.consumed_at}`}
                  style={[styles.optionRow, selectedBeerId === beer.id ? styles.optionRowActive : null]}
                  onPress={() => beer.id && onSelectBeer(beer.id)}
                  activeOpacity={0.76}
                >
                  <Beer color={selectedBeerId === beer.id ? colors.background : colors.primary} size={18} />
                  <View style={styles.optionText}>
                    <Text style={[styles.optionTitle, selectedBeerId === beer.id ? styles.optionTitleActive : null]}>
                      {beer.beer_name}
                    </Text>
                    <Text style={[styles.optionMeta, selectedBeerId === beer.id ? styles.optionMetaActive : null]}>
                      {getBeerLine(beer)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            <View style={styles.formBox}>
              <Text style={styles.sectionTitle}>Add a 33cl bottle</Text>
              <BeerDraftForm
                draft={beerDraft}
                onChange={onBeerDraftChange}
                onSubmit={onCreateBeer}
                submitLabel="Add 33cl Bottle"
                loading={busy}
              />
            </View>

            <Text style={styles.sectionTitle}>Verifier</Text>
            {mutualFollowers.length === 0 ? (
              <View style={styles.emptyBox}>
                <UserCheck color={colors.textMuted} size={22} />
                <Text style={styles.emptyText}>Add a mutual follower before chug verification.</Text>
              </View>
            ) : (
              mutualFollowers.map((follower) => (
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
              ))
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
            ) : (
              <AppButton label="Record Chug" onPress={onRecord} loading={busy} disabled={!canRecord} />
            )}
          </View>
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
    height: 138,
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
  guidanceText: {
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
  formBox: {
    marginTop: 4,
    gap: spacing.sm,
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
});
