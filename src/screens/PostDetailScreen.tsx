import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react-native';

import { CachedImage } from '../components/CachedImage';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { FeedSessionCard, FeedSession } from './FeedScreen';
import { SessionBeer } from '../lib/sessionBeers';
import { supabase } from '../lib/supabase';
import { confirmDestructive } from '../lib/dialogs';
import { deletePublicImageUrl } from '../lib/imageUpload';
import { hapticLight, hapticWarning } from '../lib/haptics';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';
import { typography } from '../theme/typography';

type ProfilePreview = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

type PostComment = {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  profiles?: ProfilePreview | null;
};

const getTimeAgo = (dateString?: string | null) => {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.max(0, Math.round(diffMs / 60000));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${Math.round(diffHours / 24)} days ago`;
};

export const PostDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const sessionId = route?.params?.sessionId as string | undefined;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [session, setSession] = useState<FeedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cheering, setCheering] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const composerRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);

  const fetchPost = useCallback(async () => {
    if (!sessionId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const { data: sessionRow, error: sessionError } = await supabase
        .from('sessions')
        .select(`
          id,
          user_id,
          pub_id,
          pub_name,
          beer_name,
          volume,
          quantity,
          abv,
          comment,
          image_url,
          status,
          started_at,
          ended_at,
          published_at,
          edited_at,
          hangover_score,
          created_at
        `)
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError) throw sessionError;

      if (!sessionRow) {
        setNotFound(true);
        setSession(null);
        return;
      }

      const [beersResult, cheersResult, commentsResult] = await Promise.all([
        supabase
          .from('session_beers')
          .select('id, session_id, beer_name, volume, quantity, abv, note, consumed_at, created_at')
          .eq('session_id', sessionId)
          .order('consumed_at', { ascending: true }),
        supabase
          .from('session_cheers')
          .select('session_id, user_id, created_at')
          .eq('session_id', sessionId),
        supabase
          .from('session_comments')
          .select('id, session_id, user_id, body, created_at, updated_at')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true }),
      ]);

      if (beersResult.error) console.error('Post beers fetch error:', beersResult.error);
      if (cheersResult.error) console.error('Post cheers fetch error:', cheersResult.error);
      if (commentsResult.error) console.error('Post comments fetch error:', commentsResult.error);

      const beerRows = (beersResult.data || []) as SessionBeer[];
      const cheerRows = (cheersResult.data || []) as { user_id: string }[];
      const commentRows = (commentsResult.data || []) as PostComment[];

      const profileIds = Array.from(new Set([
        sessionRow.user_id,
        ...cheerRows.map((cheer) => cheer.user_id),
        ...commentRows.map((comment) => comment.user_id),
      ].filter(Boolean)));

      const profilesById = new Map<string, ProfilePreview>();
      if (profileIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', profileIds);

        if (profilesError) {
          console.error('Post profiles fetch error:', profilesError);
        } else {
          (profileRows || []).forEach((profile: any) => {
            profilesById.set(profile.id, {
              id: profile.id,
              username: profile.username,
              avatar_url: profile.avatar_url,
            });
          });
        }
      }

      const sessionBeers = beerRows.length > 0
        ? beerRows
        : (sessionRow.beer_name
            ? [{
                session_id: sessionRow.id,
                beer_name: sessionRow.beer_name,
                volume: sessionRow.volume,
                quantity: sessionRow.quantity,
                abv: sessionRow.abv ?? null,
                consumed_at: sessionRow.created_at,
              }]
            : []);

      const comments = commentRows.map((comment) => ({
        ...comment,
        profiles: profilesById.get(comment.user_id) || null,
      }));

      const assembled: FeedSession = {
        ...sessionRow,
        session_beers: sessionBeers,
        profiles: profilesById.get(sessionRow.user_id) || null,
        cheer_profiles: cheerRows
          .map((cheer) => profilesById.get(cheer.user_id))
          .filter(Boolean) as any,
        comments: comments as any,
        comments_count: comments.length,
        cheers_count: cheerRows.length,
        has_cheered: user ? cheerRows.some((cheer) => cheer.user_id === user.id) : false,
      };

      setNotFound(false);
      setSession(assembled);
    } catch (error) {
      console.error('Post detail fetch error:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      fetchPost();
    }, [fetchPost])
  );

  const openProfile = useCallback((userId: string) => {
    if (userId === currentUserId) {
      navigation.navigate('MainTabs', { screen: 'Profile' });
      return;
    }
    navigation.navigate('UserProfile', { userId });
  }, [currentUserId, navigation]);

  const editSession = useCallback((target: FeedSession) => {
    navigation.navigate('EditSession', { sessionId: target.id });
  }, [navigation]);

  const openComments = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const toggleCheers = useCallback(async (target: FeedSession) => {
    if (!currentUserId || target.user_id === currentUserId || cheering) return;

    const nextHasCheered = !target.has_cheered;
    setCheering(true);
    setSession((prev) => (prev ? {
      ...prev,
      has_cheered: nextHasCheered,
      cheers_count: Math.max(0, prev.cheers_count + (nextHasCheered ? 1 : -1)),
    } : prev));

    try {
      if (nextHasCheered) {
        const { error } = await supabase
          .from('session_cheers')
          .insert({ session_id: target.id, user_id: currentUserId });
        if (error && error.code !== '23505') throw error;

        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: target.user_id,
          actor_id: currentUserId,
          type: 'cheer',
          reference_id: target.id,
        });
        if (notifError) console.error('Cheer notification insert error:', notifError);
      } else {
        const { error } = await supabase
          .from('session_cheers')
          .delete()
          .eq('session_id', target.id)
          .eq('user_id', currentUserId);
        if (error) throw error;

        await supabase.from('notifications')
          .delete()
          .eq('user_id', target.user_id)
          .eq('actor_id', currentUserId)
          .eq('type', 'cheer')
          .eq('reference_id', target.id);
      }
    } catch (error: any) {
      setSession((prev) => (prev ? {
        ...prev,
        has_cheered: !nextHasCheered,
        cheers_count: Math.max(0, prev.cheers_count + (nextHasCheered ? -1 : 1)),
      } : prev));
      Alert.alert('Could not update cheers', error?.message || 'Please try again.');
    } finally {
      setCheering(false);
    }
  }, [cheering, currentUserId]);

  const deleteSession = useCallback((target: FeedSession) => {
    if (!currentUserId) return;

    hapticWarning();
    confirmDestructive('Delete Post', 'Remove this beer session from your feed?', 'Delete', async () => {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', target.id)
        .eq('user_id', currentUserId);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (target.image_url) {
        deletePublicImageUrl('session_images', target.image_url);
      }
      navigation.goBack();
    });
  }, [currentUserId, navigation]);

  const submitComment = useCallback(async () => {
    const cleanComment = commentDraft.trim();
    if (!currentUserId || !session || !cleanComment || submittingComment) return;

    setSubmittingComment(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', currentUserId)
        .maybeSingle();

      if (profileError) console.error('Comment profile fetch error:', profileError);

      const currentProfile: ProfilePreview | null = profileData
        ? { id: profileData.id, username: profileData.username, avatar_url: profileData.avatar_url }
        : null;

      const { data, error } = await supabase
        .from('session_comments')
        .insert({
          session_id: session.id,
          user_id: currentUserId,
          body: cleanComment,
        })
        .select('id, session_id, user_id, body, created_at, updated_at')
        .single();

      if (error) throw error;

      const nextComment: PostComment = {
        ...(data as Omit<PostComment, 'profiles'>),
        profiles: currentProfile,
      };

      setSession((prev) => (prev ? {
        ...prev,
        comments: [...prev.comments, nextComment as any],
        comments_count: prev.comments_count + 1,
      } : prev));
      setCommentDraft('');
      hapticLight();

      if (session.user_id !== currentUserId) {
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: session.user_id,
          actor_id: currentUserId,
          type: 'comment',
          reference_id: session.id,
        });
        if (notifError) console.error('Comment notification insert error:', notifError);
      }
    } catch (error: any) {
      console.error('Submit comment error:', error);
      Alert.alert('Could not post comment', error?.message || 'Please try again.');
    } finally {
      setSubmittingComment(false);
    }
  }, [commentDraft, currentUserId, session, submittingComment]);

  const renderComment = useCallback(({ item }: { item: PostComment }) => (
    <View style={styles.commentRow}>
      <TouchableOpacity onPress={() => openProfile(item.user_id)} activeOpacity={0.75}>
        <CachedImage
          uri={item.profiles?.avatar_url}
          fallbackUri={`https://i.pravatar.cc/150?u=${item.user_id}`}
          style={styles.commentAvatar}
          recyclingKey={`post-comment-${item.id}-${item.profiles?.avatar_url || 'fallback'}`}
          accessibilityLabel={`${item.profiles?.username || 'Someone'}'s avatar`}
        />
      </TouchableOpacity>
      <View style={styles.commentBubble}>
        <Text style={styles.commentBubbleName}>{item.profiles?.username || 'Someone'}</Text>
        <Text style={styles.commentBubbleText}>{item.body}</Text>
        <Text style={styles.commentTime}>{getTimeAgo(item.created_at)}</Text>
      </View>
    </View>
  ), [openProfile]);

  const renderHeader = useCallback(() => {
    if (!session) return null;
    return (
      <View>
        <FeedSessionCard
          item={session}
          currentUserId={currentUserId}
          isCheering={cheering}
          onDeleteSession={deleteSession}
          onEditSession={editSession}
          onOpenCheers={() => {}}
          onOpenComments={openComments}
          onOpenProfile={openProfile}
          onImagePress={setViewingImageUrl}
          onToggleCheers={toggleCheers}
        />
        <View style={styles.commentsHeader}>
          <MessageCircle color={colors.primary} size={17} />
          <Text style={styles.commentsHeaderText}>
            {session.comments_count > 0
              ? `${session.comments_count} ${session.comments_count === 1 ? 'Comment' : 'Comments'}`
              : 'Comments'}
          </Text>
        </View>
      </View>
    );
  }, [cheering, currentUserId, deleteSession, editSession, openComments, openProfile, session, toggleCheers]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Post</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : notFound || !session ? (
        <View style={styles.emptyState}>
          <Text style={typography.h3}>Post unavailable</Text>
          <Text style={styles.emptyText}>This session may have been deleted.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            ref={listRef}
            data={session.comments as PostComment[]}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.commentsEmpty}>
                <Text style={styles.emptyText}>No comments yet. Be the first to say something.</Text>
              </View>
            }
          />
          <View style={styles.commentComposer}>
            <TextInput
              ref={composerRef}
              style={styles.commentComposerInput}
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textMuted}
              maxLength={500}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.commentSendButton,
                (!commentDraft.trim() || submittingComment) ? styles.commentSendButtonDisabled : null,
              ]}
              onPress={submitComment}
              disabled={!commentDraft.trim() || submittingComment}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Post comment"
            >
              {submittingComment ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Send color={colors.background} size={18} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      <ImageViewerModal
        visible={Boolean(viewingImageUrl)}
        imageUrl={viewingImageUrl}
        onClose={() => setViewingImageUrl(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingTop: Platform.OS === 'web' ? 18 : 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  backButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  screenTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: Platform.OS === 'web' ? 12 : 14,
    paddingBottom: 16,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 520 : undefined,
    alignSelf: 'center',
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 12,
  },
  commentsHeaderText: {
    ...typography.h3,
    fontSize: 16,
  },
  commentsEmpty: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  commentBubble: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  commentBubbleName: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  commentBubbleText: {
    ...typography.body,
    color: colors.text,
    marginTop: 3,
    lineHeight: 21,
  },
  commentTime: {
    ...typography.caption,
    marginTop: 6,
  },
  commentComposer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: colors.card,
  },
  commentComposerInput: {
    ...typography.body,
    flex: 1,
    minHeight: 42,
    maxHeight: 118,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  commentSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  commentSendButtonDisabled: {
    opacity: 0.55,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 8,
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
});
