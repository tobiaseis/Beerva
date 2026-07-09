import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Search, UserRound, X } from 'lucide-react-native';

import { CachedImage } from './CachedImage';
import { Surface } from './Surface';
import { showAlert } from '../lib/dialogs';
import { hapticLight, hapticSuccess } from '../lib/haptics';
import {
  fetchMutualMateOptions,
  fetchSessionBuddies,
  MutualMateOption,
  SessionBuddy,
  setSessionBuddies,
} from '../lib/sessionBuddies';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type DrinkingBuddiesPickerProps = {
  sessionId: string;
  disabled?: boolean;
  variant?: 'card' | 'inline';
};

export const DrinkingBuddiesPicker = ({
  sessionId,
  disabled = false,
  variant = 'card',
}: DrinkingBuddiesPickerProps) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedBuddies, setSelectedBuddies] = useState<SessionBuddy[]>([]);
  const [mutualMates, setMutualMates] = useState<MutualMateOption[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedBuddyIds = useMemo(
    () => new Set(selectedBuddies.map((buddy) => buddy.buddyUserId)),
    [selectedBuddies]
  );

  const loadBuddies = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const [{ data: { user } }, buddies] = await Promise.all([
        supabase.auth.getUser(),
        fetchSessionBuddies(sessionId),
      ]);
      setCurrentUserId(user?.id || null);
      setSelectedBuddies(buddies);
      setMutualMates(user?.id ? await fetchMutualMateOptions(user.id) : []);
    } catch (error: any) {
      console.error('Drinking buddies load error:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadBuddies();
  }, [loadBuddies]);

  const filteredMates = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return mutualMates;
    return mutualMates.filter((mate) => (mate.username || 'Someone').toLowerCase().includes(cleanQuery));
  }, [mutualMates, query]);

  const saveSelection = useCallback(async (nextIds: string[]) => {
    if (!currentUserId || saving) return;

    setSaving(true);
    try {
      const nextBuddies = await setSessionBuddies(sessionId, nextIds);
      setSelectedBuddies(nextBuddies);
      hapticSuccess();
    } catch (error: any) {
      showAlert('Could not update buddies', error?.message || 'Please try again.');
      await loadBuddies();
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadBuddies, saving, sessionId]);

  const toggleMate = (mate: MutualMateOption) => {
    hapticLight();
    const buddyIds = selectedBuddies.map((buddy) => buddy.buddyUserId);
    const nextIds = selectedBuddyIds.has(mate.id)
      ? buddyIds.filter((id) => id !== mate.id)
      : [...buddyIds, mate.id];
    saveSelection(nextIds);
  };

  const closePicker = () => {
    setModalVisible(false);
    setQuery('');
  };

  const isInline = variant === 'inline';
  const buddySummary = selectedBuddies.length ? `${selectedBuddies.length} added` : 'Mutual mates only';
  const buttonLabel = isInline
    ? selectedBuddies.length ? 'Edit buddies' : 'Add buddies'
    : 'Add your drinking buddies';

  const buddyChips = selectedBuddies.length > 0 ? (
    <View style={styles.chipList}>
      {selectedBuddies.map((buddy) => (
        <View key={buddy.id} style={styles.chip}>
          <CachedImage
            uri={buddy.avatarUrl}
            fallbackUri={`https://i.pravatar.cc/150?u=${buddy.buddyUserId}`}
            style={styles.chipAvatar}
            recyclingKey={`buddy-${buddy.buddyUserId}-${buddy.avatarUrl || 'fallback'}`}
            accessibilityLabel={`${buddy.username || 'Someone'}'s avatar`}
          />
          <Text style={styles.chipText} numberOfLines={1}>{buddy.username || 'Someone'}</Text>
        </View>
      ))}
    </View>
  ) : null;

  const addButton = (
    <TouchableOpacity
      style={[
        isInline ? styles.inlineAddButton : styles.addButton,
        disabled || saving ? styles.addButtonDisabled : null,
      ]}
      onPress={() => setModalVisible(true)}
      disabled={disabled || saving}
      activeOpacity={0.76}
      accessibilityRole="button"
      accessibilityLabel="Add your drinking buddies"
    >
      <UserRound color={colors.primary} size={isInline ? 16 : 18} />
      <Text style={isInline ? styles.inlineAddButtonText : styles.addButtonText}>{buttonLabel}</Text>
    </TouchableOpacity>
  );

  const pickerModal = (
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closePicker}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Drinking buddies</Text>
                <Text style={styles.sheetSubtitle}>Choose from your mutual mates.</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closePicker}
                accessibilityRole="button"
                accessibilityLabel="Close drinking buddies picker"
              >
                <X color={colors.text} size={21} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Search color={colors.textMuted} size={18} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search mutual mates"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Search mutual mates"
              />
            </View>

            <ScrollView contentContainerStyle={styles.mateList} keyboardShouldPersistTaps="handled">
              {filteredMates.map((mate) => {
                const selected = selectedBuddyIds.has(mate.id);
                return (
                  <TouchableOpacity
                    key={mate.id}
                    style={[styles.mateRow, selected ? styles.mateRowSelected : null]}
                    onPress={() => toggleMate(mate)}
                    disabled={saving}
                    activeOpacity={0.75}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled: saving }}
                  >
                    <CachedImage
                      uri={mate.avatarUrl}
                      fallbackUri={`https://i.pravatar.cc/150?u=${mate.id}`}
                      style={styles.mateAvatar}
                      recyclingKey={`mate-${mate.id}-${mate.avatarUrl || 'fallback'}`}
                      accessibilityLabel={`${mate.username || 'Someone'}'s avatar`}
                    />
                    <Text style={styles.mateName}>{mate.username || 'Someone'}</Text>
                    {selected ? <Check color={colors.success} size={19} /> : null}
                  </TouchableOpacity>
                );
              })}
              {!filteredMates.length ? <Text style={styles.emptyText}>No mutual mates found.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
  );

  if (variant === 'inline') {
    return (
      <View style={styles.inlineContainer}>
        <View style={styles.inlineHeader}>
          <View style={styles.inlineText}>
            <Text style={styles.inlineTitle}>Drinking buddies</Text>
            <Text style={styles.inlineSubtitle}>{buddySummary}</Text>
          </View>
          {loading ? <ActivityIndicator color={colors.primary} size="small" /> : addButton}
        </View>
        {buddyChips}
        {loading ? null : pickerModal}
      </View>
    );
  }

  return (
    <Surface style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Drinking buddies</Text>
          <Text style={styles.subtitle}>{buddySummary}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      </View>

      {buddyChips}
      {addButton}
      {pickerModal}
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    ...typography.h3,
  },
  subtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  inlineContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 8,
  },
  inlineHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  inlineText: {
    flex: 1,
    minWidth: 0,
  },
  inlineTitle: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '900',
  },
  inlineSubtitle: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 1,
  },
  chipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 34,
    maxWidth: '100%',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  chipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  chipText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
    flexShrink: 1,
  },
  addButton: {
    minHeight: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  addButtonDisabled: {
    opacity: 0.65,
  },
  inlineAddButton: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 11,
  },
  inlineAddButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '900',
  },
  addButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '900',
    flexShrink: 1,
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    maxHeight: '82%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetTitle: {
    ...typography.h3,
  },
  sheetSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  searchBox: {
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    padding: 0,
  },
  mateList: {
    gap: 8,
    paddingBottom: 8,
  },
  mateRow: {
    minHeight: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  mateRowSelected: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  mateAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  mateName: {
    ...typography.body,
    flex: 1,
    minWidth: 0,
    fontWeight: '800',
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
    paddingVertical: 18,
  },
});
