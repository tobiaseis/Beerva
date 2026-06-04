import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import {
  getActiveMentionTrigger,
  insertMentionAtTrigger,
  MentionCandidate,
  MentionProfile,
  sanitizeMentionCandidates,
  searchMentionProfiles,
} from '../lib/mentions';
import { supabase } from '../lib/supabase';
import { CachedImage } from './CachedImage';
import { colors } from '../theme/colors';
import { radius, shadows } from '../theme/layout';
import { typography } from '../theme/typography';

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  mentions: MentionCandidate[];
  onMentionsChange: (mentions: MentionCandidate[]) => void;
  currentUserId: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
  inputRef?: React.Ref<TextInput>;
};

export const MentionComposer = ({
  value,
  onChangeText,
  mentions,
  onMentionsChange,
  currentUserId,
  containerStyle,
  inputStyle,
  inputRef,
  onSelectionChange,
  ...inputProps
}: Props) => {
  const [cursor, setCursor] = useState(value.length);
  const [results, setResults] = useState<MentionProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);

  const trigger = useMemo(
    () => getActiveMentionTrigger(value, cursor),
    [cursor, value]
  );

  useEffect(() => {
    const query = trigger?.query.trim() || '';
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timeout = setTimeout(() => {
      searchMentionProfiles(supabase, query, currentUserId, 8)
        .then((profiles) => {
          if (requestIdRef.current === requestId) setResults(profiles);
        })
        .catch((error) => {
          console.warn('Mention search failed:', error);
          if (requestIdRef.current === requestId) setResults([]);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setSearching(false);
        });
    }, 180);

    return () => clearTimeout(timeout);
  }, [currentUserId, trigger?.query]);

  const updateText = (nextText: string) => {
    onChangeText(nextText);
    onMentionsChange(sanitizeMentionCandidates(nextText, mentions));
  };

  const selectProfile = (profile: MentionProfile) => {
    const inserted = insertMentionAtTrigger(value, cursor, profile);
    onChangeText(inserted.text);
    if (inserted.mention) {
      onMentionsChange(sanitizeMentionCandidates(inserted.text, [...mentions, inserted.mention]));
    }
    setCursor(inserted.cursor);
    setResults([]);
  };

  const hasDropdown = Boolean(trigger?.query && (searching || results.length > 0));

  return (
    <View style={[styles.container, containerStyle]}>
      {hasDropdown ? (
        <View style={styles.dropdown}>
          {searching ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
            {results.map((profile) => (
              <Pressable
                key={profile.id}
                style={({ pressed }) => [styles.resultRow, pressed ? styles.resultRowPressed : null]}
                onPress={() => selectProfile(profile)}
              >
                <CachedImage
                  uri={profile.avatarUrl}
                  fallbackUri={`https://i.pravatar.cc/150?u=${profile.id}`}
                  style={styles.avatar}
                  recyclingKey={`mention-${profile.id}-${profile.avatarUrl || 'fallback'}`}
                  accessibilityLabel={`${profile.username || 'Someone'}'s avatar`}
                />
                <Text style={styles.username} numberOfLines={1}>{profile.username}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <TextInput
        ref={inputRef}
        {...inputProps}
        style={inputStyle}
        value={value}
        onChangeText={updateText}
        onSelectionChange={(event) => {
          setCursor(event.nativeEvent.selection.start);
          onSelectionChange?.(event);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  dropdown: {
    marginBottom: 6,
    maxHeight: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    ...shadows.raised,
  },
  loadingRow: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  resultRowPressed: {
    backgroundColor: colors.glass,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  username: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    fontWeight: '800',
  },
});
