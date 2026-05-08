import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Platform, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Search, UserCheck, UserPlus, Users } from 'lucide-react-native';

import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type UserProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  updated_at?: string | null;
};

type FollowRow = {
  following_id: string;
};

const useDebouncedValue = <T,>(value: T, delayMs: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
};

export const PeopleScreen = ({ navigation }: any) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<UserProfileRow[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const fetchPeople = useCallback(async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPeople([]);
        return;
      }

      setCurrentUserId(user.id);

      let profileRequest = supabase
        .from('profiles')
        .select('id, username, avatar_url, updated_at')
        .neq('id', user.id)
        .order('username', { ascending: true })
        .limit(40);

      if (debouncedQuery) {
        profileRequest = profileRequest.ilike('username', `%${debouncedQuery}%`);
      }

      const [profilesResult, followsResult] = await Promise.all([
        profileRequest,
        supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id),
      ]);

      if (profilesResult.error) throw profilesResult.error;

      if (followsResult.error) {
        console.error('Follows fetch error:', followsResult.error);
      }

      setPeople((profilesResult.data || []) as UserProfileRow[]);
      setFollowingIds(new Set(((followsResult.data || []) as FollowRow[]).map((follow) => follow.following_id)));
    } catch (error) {
      console.error('People fetch error:', error);
      setPeople([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPeople();
  }, [fetchPeople]);

  const openProfile = useCallback((userId: string) => {
    navigation.getParent()?.navigate('UserProfile', { userId });
  }, [navigation]);

  const toggleFollow = useCallback(async (profileId: string) => {
    if (!currentUserId || pendingFollowIds.has(profileId)) return;

    const wasFollowing = followingIds.has(profileId);

    setPendingFollowIds((previous) => {
      const next = new Set(previous);
      next.add(profileId);
      return next;
    });

    setFollowingIds((previous) => {
      const next = new Set(previous);
      if (wasFollowing) {
        next.delete(profileId);
      } else {
        next.add(profileId);
      }
      return next;
    });

    try {
      if (wasFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', profileId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: currentUserId,
            following_id: profileId,
          });

        if (error && error.code !== '23505') throw error;
      }
    } catch (error) {
      console.error('Follow toggle error:', error);
      setFollowingIds((previous) => {
        const next = new Set(previous);
        if (wasFollowing) {
          next.add(profileId);
        } else {
          next.delete(profileId);
        }
        return next;
      });
    } finally {
      setPendingFollowIds((previous) => {
        const next = new Set(previous);
        next.delete(profileId);
        return next;
      });
    }
  }, [currentUserId, followingIds, pendingFollowIds]);

  const renderPerson = useCallback(({ item }: { item: UserProfileRow }) => {
    const isFollowing = followingIds.has(item.id);
    const isPending = pendingFollowIds.has(item.id);

    return (
      <View style={styles.personRow}>
        <TouchableOpacity
          style={styles.personIdentity}
          onPress={() => openProfile(item.id)}
          activeOpacity={0.72}
        >
          <Image
            source={{ uri: item.avatar_url || `https://i.pravatar.cc/150?u=${item.id}` }}
            style={styles.avatar}
          />
          <View style={styles.personText}>
            <Text style={styles.username}>{item.username || 'Beer Lover'}</Text>
            <Text style={styles.metaText}>{isFollowing ? 'Following' : 'Tap to view profile'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.followButton, isFollowing ? styles.followingButton : null]}
          onPress={() => toggleFollow(item.id)}
          disabled={isPending}
          activeOpacity={0.75}
        >
          {isFollowing ? (
            <UserCheck color={colors.background} size={16} />
          ) : (
            <UserPlus color={colors.background} size={16} />
          )}
          <Text style={styles.followButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
        </TouchableOpacity>
      </View>
    );
  }, [followingIds, openProfile, pendingFollowIds, toggleFollow]);

  const emptyText = debouncedQuery
    ? `No users found for "${debouncedQuery}"`
    : 'Search for friends and follow them to build your feed.';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Users color={colors.primary} size={26} />
          <Text style={styles.title}>People</Text>
        </View>
        <View style={styles.searchBox}>
          <Search color={colors.textMuted} size={18} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search users"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.id}
          renderItem={renderPerson}
          contentContainerStyle={[styles.listContent, people.length === 0 ? styles.emptyContent : null]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Users color={colors.textMuted} size={34} />
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 18 : 60,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
    gap: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 28,
    color: colors.primary,
  },
  searchBox: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    marginLeft: 10,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: Platform.OS === 'web' ? 14 : 16,
    paddingBottom: Platform.OS === 'web' ? 24 : 16,
    gap: 12,
  },
  emptyContent: {
    flexGrow: 1,
  },
  personRow: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    marginRight: 12,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    ...typography.h3,
    fontSize: 16,
  },
  metaText: {
    ...typography.caption,
    marginTop: 3,
  },
  followButton: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 12,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  followingButton: {
    backgroundColor: colors.primaryDark,
  },
  followButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 12,
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
