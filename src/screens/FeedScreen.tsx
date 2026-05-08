import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Platform } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Beer, MapPin, Trash2 } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { confirmDestructive } from '../lib/dialogs';
import { useFocusEffect } from '@react-navigation/native';

const beervaLogo = require('../../assets/beerva-app-icon.png');

type SessionCheer = {
  session_id: string;
  user_id: string;
};

type FeedSession = {
  id: string;
  user_id: string;
  pub_name: string;
  beer_name: string;
  volume: string | null;
  quantity: number | null;
  comment: string | null;
  image_url: string | null;
  created_at: string;
  profiles?: {
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  cheers_count: number;
  has_cheered: boolean;
};

export const FeedScreen = () => {
  const [sessions, setSessions] = useState<FeedSession[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cheeringSessionIds, setCheeringSessionIds] = useState<Set<string>>(() => new Set());

  const fetchSessions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          user_id,
          pub_name,
          beer_name,
          volume,
          quantity,
          comment,
          image_url,
          created_at,
          profiles (
            username,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const sessionRows = ((data || []) as any[]).map((session) => ({
        ...session,
        profiles: Array.isArray(session.profiles) ? session.profiles[0] || null : session.profiles,
      }));
      const sessionIds = sessionRows.map((session) => session.id);
      let cheers: SessionCheer[] = [];

      if (sessionIds.length > 0) {
        const { data: cheersData, error: cheersError } = await supabase
          .from('session_cheers')
          .select('session_id, user_id')
          .in('session_id', sessionIds);

        if (cheersError) {
          console.error('Cheers fetch error:', cheersError);
        } else {
          cheers = cheersData || [];
        }
      }

      const cheersBySession = cheers.reduce((acc, cheer) => {
        const existing = acc.get(cheer.session_id) || [];
        existing.push(cheer);
        acc.set(cheer.session_id, existing);
        return acc;
      }, new Map<string, SessionCheer[]>());

      setSessions(sessionRows.map((session) => {
        const sessionCheers = cheersBySession.get(session.id) || [];

        return {
          ...session,
          cheers_count: sessionCheers.length,
          has_cheered: user ? sessionCheers.some((cheer) => cheer.user_id === user.id) : false,
        };
      }));
    } catch (error) {
      console.error('Feed fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchSessions();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchSessions();
  };

  const getDrinkLabel = (item: FeedSession) => {
    const volume = item.volume || 'Pint';
    const quantity = item.quantity || 1;

    return quantity > 1 ? `${quantity} x ${volume}` : volume;
  };

  const getCheersLabel = (count: number) => {
    return `${count} ${count === 1 ? 'Cheer' : 'Cheers'}`;
  };

  const toggleCheers = async (item: FeedSession) => {
    if (!currentUserId || item.user_id === currentUserId || cheeringSessionIds.has(item.id)) {
      return;
    }

    const nextHasCheered = !item.has_cheered;
    const previousHasCheered = item.has_cheered;
    const previousCheersCount = item.cheers_count;

    setCheeringSessionIds((previous) => {
      const next = new Set(previous);
      next.add(item.id);
      return next;
    });

    setSessions((previous) => previous.map((session) => {
      if (session.id !== item.id) return session;

      return {
        ...session,
        has_cheered: nextHasCheered,
        cheers_count: Math.max(0, previousCheersCount + (nextHasCheered ? 1 : -1)),
      };
    }));

    try {
      if (nextHasCheered) {
        const { error } = await supabase
          .from('session_cheers')
          .insert({
            session_id: item.id,
            user_id: currentUserId,
          });

        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase
          .from('session_cheers')
          .delete()
          .eq('session_id', item.id)
          .eq('user_id', currentUserId);

        if (error) throw error;
      }
    } catch (error: any) {
      setSessions((previous) => previous.map((session) => (
        session.id === item.id
          ? {
              ...session,
              has_cheered: previousHasCheered,
              cheers_count: previousCheersCount,
            }
          : session
      )));
      Alert.alert('Could not update cheers', error?.message || 'Please try again.');
    } finally {
      setCheeringSessionIds((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
    }
  };

  const deleteSession = (sessionId: string) => {
    if (!currentUserId) return;

    confirmDestructive('Delete Post', 'Remove this beer session from your feed?', 'Delete', async () => {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', currentUserId);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setSessions((previous) => previous.filter((session) => session.id !== sessionId));
    });
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${Math.round(diffHours / 24)} days ago`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image source={beervaLogo} style={styles.logoImage} />
          <Text style={styles.logoText}>Beerva</Text>
        </View>
      </View>
      
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {sessions.length === 0 ? (
            <Text style={[typography.bodyMuted, { textAlign: 'center', marginTop: 40 }]}>
              No sessions yet. Be the first to record a pint!
            </Text>
          ) : null}

          {sessions.map((item) => {
            const isOwnPost = item.user_id === currentUserId;
            const isCheering = cheeringSessionIds.has(item.id);
            const cheersColor = item.has_cheered ? colors.primary : colors.textMuted;

            return (
              <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Image source={{ uri: item.profiles?.avatar_url || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.profiles?.username || 'Unknown'}</Text>
                  <Text style={styles.timeText}>{getTimeAgo(item.created_at)}</Text>
                </View>
                {item.user_id === currentUserId ? (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteSession(item.id)}
                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  >
                    <Trash2 color={colors.danger} size={18} />
                  </TouchableOpacity>
                ) : null}
              </View>
              
              {item.image_url && (
                <Image source={{ uri: item.image_url }} style={styles.feedImage} />
              )}

              <View style={styles.cardContent}>
                <View style={styles.row}>
                  <MapPin color={colors.primary} size={16} />
                  <Text style={styles.locationText}> Drinking at <Text style={styles.bold}>{item.pub_name}</Text></Text>
                </View>
                <View style={[styles.row, { marginTop: 8 }]}>
                  <Beer color={colors.primary} size={16} />
                  <Text style={styles.beerText}> {getDrinkLabel(item)} of <Text style={styles.bold}>{item.beer_name}</Text></Text>
                </View>
                {item.comment ? (
                  <View style={styles.commentBlock}>
                    <Text style={styles.commentText}>{item.comment}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.cardFooter}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    item.has_cheered ? styles.actionBtnActive : null,
                    isOwnPost ? styles.actionBtnDisabled : null,
                  ]}
                  onPress={() => toggleCheers(item)}
                  disabled={isOwnPost || isCheering || !currentUserId}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel={`Give cheers to ${item.profiles?.username || 'this post'}`}
                  accessibilityState={{ disabled: isOwnPost || isCheering || !currentUserId, selected: item.has_cheered }}
                >
                  <Beer color={cheersColor} fill={item.has_cheered ? 'rgba(245, 158, 11, 0.2)' : 'transparent'} size={20} />
                  <Text style={[styles.actionText, item.has_cheered ? styles.actionTextActive : null]}>
                    {getCheersLabel(item.cheers_count)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 18 : 60,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'web' ? 14 : 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 34,
    height: 34,
    borderRadius: 9,
    marginRight: 10,
  },
  logoText: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 28,
    color: colors.primary,
  },
  scrollContent: {
    padding: Platform.OS === 'web' ? 14 : 16,
    paddingBottom: Platform.OS === 'web' ? 24 : 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  userName: {
    ...typography.h3,
    fontSize: 16,
  },
  timeText: {
    ...typography.caption,
  },
  feedImage: {
    width: '100%',
    height: Platform.OS === 'web' ? 220 : 250,
  },
  cardContent: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    ...typography.body,
    color: colors.text,
  },
  beerText: {
    ...typography.body,
    color: colors.text,
  },
  commentBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: colors.primary,
  },
  cardFooter: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.32)',
  },
  actionBtnDisabled: {
    opacity: 0.62,
  },
  actionText: {
    ...typography.bodyMuted,
    marginLeft: 8,
    fontWeight: '600',
  },
  actionTextActive: {
    color: colors.primary,
  },
});
