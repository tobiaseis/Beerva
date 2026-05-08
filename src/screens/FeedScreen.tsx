import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Beer, MapPin, Trash2 } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { confirmDestructive } from '../lib/dialogs';
import { useFocusEffect } from '@react-navigation/native';

export const FeedScreen = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = async () => {
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

    if (!error && data) {
      setSessions(data);
    }
    setLoading(false);
    setRefreshing(false);
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

  const getDrinkLabel = (item: any) => {
    const volume = item.volume || 'Pint';
    const quantity = item.quantity || 1;

    return quantity > 1 ? `${quantity} x ${volume}` : volume;
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
          <Beer color={colors.primary} size={28} />
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

          {sessions.map((item) => (
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
                <View style={styles.actionBtn}>
                  <Beer color={colors.textMuted} size={20} />
                  <Text style={styles.actionText}>0 Cheers</Text>
                </View>
              </View>
            </View>
          ))}
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
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 28,
    color: colors.primary,
    marginLeft: 8,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 20,
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
    height: 250,
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
    padding: 16,
    flexDirection: 'row',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    ...typography.bodyMuted,
    marginLeft: 8,
    fontWeight: '600',
  },
});
