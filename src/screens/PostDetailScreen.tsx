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
import { MentionComposer } from '../components/MentionComposer';
import { MentionText } from '../components/MentionText';
import { PubCrawlFeedCard } from '../components/PubCrawlFeedCard';
import { FeedSessionCard, FeedSession } from './FeedScreen';
import { PubCrawl, PubCrawlComment } from '../lib/pubCrawls';
import { addPubCrawlComment, fetchPublishedPubCrawlById, togglePubCrawlCheers } from '../lib/pubCrawlsApi';
import { ContentMention, fetchContentMentionsForSources, MentionCandidate } from '../lib/mentions';
import { notifyContentMentionsSafely } from '../lib/mentionNotifications';
import { SessionBeer } from '../lib/sessionBeers';
import { mapChugAttemptRow, SessionChugAttemptRow } from '../lib/chugAttempts';
import { supabase } from '../lib/supabase';
import { fetchCurrentStreaks } from '../lib/currentStreaks';
import { confirmDestructive } from '../lib/dialogs';
import { deletePublicImageUrl } from '../lib/imageUpload';
import { hapticLight, hapticWarning } from '../lib/haptics';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';
import { typography } from '../theme/typography';
import { fetchSessionBuddySummaries, SessionBuddy } from '../lib/sessionBuddies';
import { getAllSessionPhotoUrls, SessionPhoto } from '../lib/sessionPhotos';

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
  mentions?: ContentMention[];
};

type PostTargetType = 'session' | 'pub_crawl';
type DetailComment = PostComment | PubCrawlComment;

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

const getDetailCommentUserId = (comment: DetailComment) => (
  'user_id' in comment ? comment.user_id : comment.userId
);

const getDetailCommentBody = (comment: DetailComment) => comment.body;

const getDetailCommentCreatedAt = (comment: DetailComment) => (
  'created_at' in comment ? comment.created_at : comment.createdAt
);

const getDetailCommentProfile = (comment: DetailComment): ProfilePreview | null => {
  if ('user_id' in comment) return comment.profiles || null;
  const { profile } = comment;
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    avatar_url: profile.avatarUrl,
  };
};

export const PostDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeTargetType = route?.params?.targetType as PostTargetType | undefined;
  const routeTargetId = route?.params?.targetId as string | undefined;
  const targetType: PostTargetType = routeTargetType === 'pub_crawl' ? 'pub_crawl' : 'session';
  const sessionId = targetType === 'session'
    ? (routeTargetId || route?.params?.sessionId as string | undefined)
    : undefined;
  const crawlId = targetType === 'pub_crawl' ? routeTargetId : undefined;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [session, setSession] = useState<FeedSession | null>(null);
  const [crawl, setCrawl] = useState<PubCrawl | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cheering, setCheering] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentMentions, setCommentMentions] = useState<MentionCandidate[]>([]);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const composerRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);

  const fetchPost = useCallback(async () => {
    setLoading(true);
    setNotFound(false);

    if (targetType === 'pub_crawl') {
      if (!crawlId) {
        setSession(null);
        setCrawl(null);
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);

        const nextCrawl = await fetchPublishedPubCrawlById(crawlId, user?.id || null);
        if (!nextCrawl) {
          setSession(null);
          setCrawl(null);
          setNotFound(true);
          return;
        }

        const [commentMentionsBySource, postMentionsBySource] = await Promise.all([
          fetchContentMentionsForSources(
            supabase,
            'comment',
            nextCrawl.comments.map((comment) => comment.id)
          ),
          fetchContentMentionsForSources(
            supabase,
            'post',
            nextCrawl.stops.map((stop) => stop.id)
          ),
        ]);

        setSession(null);
        setCrawl({
          ...nextCrawl,
          comments: nextCrawl.comments.map((comment) => ({
            ...comment,
            mentions: commentMentionsBySource.get(comment.id) || [],
          })),
          stops: nextCrawl.stops.map((stop) => ({
            ...stop,
            mentions: postMentionsBySource.get(stop.id) || [],
          })),
        });
      } catch (error) {
        console.error('Pub crawl detail fetch error:', error);
        setSession(null);
        setCrawl(null);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!sessionId) {
      setSession(null);
      setCrawl(null);
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
        setCrawl(null);
        return;
      }

      const [beersResult, cheersResult, commentsResult, chugsResult, photosResult, buddiesBySession] = await Promise.all([
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
        supabase.rpc('get_session_chug_attempt_summaries', { session_ids: [sessionId] }),
        supabase
          .from('session_photos')
          .select('id, session_id, image_url, is_keeper, expires_at, created_at')
          .eq('session_id', sessionId)
          .order('is_keeper', { ascending: false })
          .order('created_at', { ascending: true }),
        fetchSessionBuddySummaries([sessionId]).catch((error) => {
          console.error('Post buddies fetch error:', error);
          return new Map<string, SessionBuddy[]>();
        }),
      ]);

      if (beersResult.error) console.error('Post beers fetch error:', beersResult.error);
      if (cheersResult.error) console.error('Post cheers fetch error:', cheersResult.error);
      if (commentsResult.error) console.error('Post comments fetch error:', commentsResult.error);
      if (chugsResult.error) console.error('Post chugs fetch error:', chugsResult.error);
      if (photosResult.error) console.error('Post photos fetch error:', photosResult.error);

      const beerRows = (beersResult.data || []) as SessionBeer[];
      const cheerRows = (cheersResult.data || []) as { user_id: string }[];
      const commentRows = (commentsResult.data || []) as PostComment[];
      const chugRows = ((chugsResult.data || []) as SessionChugAttemptRow[]).map(mapChugAttemptRow);
      const photoRows = (photosResult.data || []) as SessionPhoto[];

      const [commentMentionsBySource, postMentionsBySource] = await Promise.all([
        fetchContentMentionsForSources(
          supabase,
          'comment',
          commentRows.map((comment) => comment.id)
        ),
        fetchContentMentionsForSources(supabase, 'post', [sessionRow.id]),
      ]);

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

      const authorStreaks = await fetchCurrentStreaks([sessionRow.user_id]);
      const authorCurrentStreak = authorStreaks.get(sessionRow.user_id) || 0;

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
        mentions: commentMentionsBySource.get(comment.id) || [],
      }));

      const assembled: FeedSession = {
        ...sessionRow,
        session_beers: sessionBeers,
        session_photos: photoRows,
        session_chug_attempts: chugRows,
        drinking_buddies: buddiesBySession.get(sessionId) || [],
        profiles: profilesById.get(sessionRow.user_id) || null,
        author_current_streak: authorCurrentStreak,
        mentions: postMentionsBySource.get(sessionRow.id) || [],
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
      setCrawl(null);
    } catch (error) {
      console.error('Post detail fetch error:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [crawlId, sessionId, targetType]);

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
          metadata: { target_type: 'session' },
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

  const toggleCrawlCheers = useCallback(async (target: PubCrawl) => {
    if (!currentUserId || target.userId === currentUserId || cheering) return;

    const hadCheered = target.cheerProfiles.some((profile) => profile.id === currentUserId);
    const previousCrawl = crawl;
    const fallbackProfile = { id: currentUserId, username: null, avatarUrl: null };

    setCheering(true);
    setCrawl((prev) => {
      if (!prev || prev.id !== target.id) return prev;
      return {
        ...prev,
        cheersCount: Math.max(0, prev.cheersCount + (hadCheered ? -1 : 1)),
        cheerProfiles: hadCheered
          ? prev.cheerProfiles.filter((profile) => profile.id !== currentUserId)
          : [...prev.cheerProfiles, fallbackProfile],
      };
    });

    try {
      const isNowCheered = await togglePubCrawlCheers(target, currentUserId);

      if (isNowCheered) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', currentUserId)
          .maybeSingle();

        if (profileError) {
          console.error('Pub crawl cheer profile fetch error:', profileError);
        } else if (profileData) {
          setCrawl((prev) => {
            if (!prev || prev.id !== target.id) return prev;
            return {
              ...prev,
              cheerProfiles: prev.cheerProfiles.map((profile) => (
                profile.id === currentUserId
                  ? {
                      id: profileData.id,
                      username: profileData.username || null,
                      avatarUrl: profileData.avatar_url || null,
                    }
                  : profile
              )),
            };
          });
        }
      }
    } catch (error: any) {
      setCrawl(previousCrawl);
      Alert.alert('Could not update cheers', error?.message || 'Please try again.');
    } finally {
      setCheering(false);
    }
  }, [cheering, crawl, currentUserId]);

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

      getAllSessionPhotoUrls(target.session_photos, target.image_url).forEach((imageUrl) => {
        deletePublicImageUrl('session_images', imageUrl);
      });
      navigation.goBack();
    });
  }, [currentUserId, navigation]);

  const submitComment = useCallback(async () => {
    const cleanComment = commentDraft.trim();
    if (!currentUserId || (!session && !crawl) || !cleanComment || submittingComment) return;

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

      if (crawl) {
        const data = await addPubCrawlComment(crawl.id, cleanComment);
        const nextComment: PubCrawlComment = {
          id: data.id,
          crawlId: data.pub_crawl_id,
          userId: data.user_id,
          body: data.body,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          mentions: [],
          profile: currentProfile
            ? {
                id: currentProfile.id,
                username: currentProfile.username || null,
                avatarUrl: currentProfile.avatar_url || null,
              }
            : null,
        };

        setCrawl((prev) => {
          if (!prev || prev.id !== crawl.id) return prev;
          return {
            ...prev,
            comments: [...prev.comments, nextComment],
            commentsCount: prev.commentsCount + 1,
          };
        });
        setCommentDraft('');
        setCommentMentions([]);
        hapticLight();

        notifyContentMentionsSafely({
          targetType: 'pub_crawl',
          targetId: crawl.id,
          surface: 'comment',
          sourceId: data.id,
          text: cleanComment,
          mentions: commentMentions,
        });

        if (crawl.userId !== currentUserId) {
          const { error: notifError } = await supabase.from('notifications').insert({
            user_id: crawl.userId,
            actor_id: currentUserId,
            type: 'comment',
            reference_id: crawl.id,
            metadata: { target_type: 'pub_crawl' },
          });
          if (notifError) console.error('Pub crawl comment notification insert error:', notifError);
        }
        return;
      }

      if (!session) return;

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
        mentions: [],
      };

      setSession((prev) => (prev ? {
        ...prev,
        comments: [...prev.comments, nextComment as any],
        comments_count: prev.comments_count + 1,
      } : prev));
      setCommentDraft('');
      setCommentMentions([]);
      hapticLight();

      notifyContentMentionsSafely({
        targetType: 'session',
        targetId: session.id,
        surface: 'comment',
        sourceId: data.id,
        text: cleanComment,
        mentions: commentMentions,
      });

      if (session.user_id !== currentUserId) {
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: session.user_id,
          actor_id: currentUserId,
          type: 'comment',
          reference_id: session.id,
          metadata: { target_type: 'session' },
        });
        if (notifError) console.error('Comment notification insert error:', notifError);
      }
    } catch (error: any) {
      console.error('Submit comment error:', error);
      Alert.alert('Could not post comment', error?.message || 'Please try again.');
    } finally {
      setSubmittingComment(false);
    }
  }, [commentDraft, commentMentions, crawl, currentUserId, session, submittingComment]);

  const renderComment = useCallback(({ item }: { item: DetailComment }) => {
    const userId = getDetailCommentUserId(item);
    const profile = getDetailCommentProfile(item);

    return (
      <View style={styles.commentRow}>
        <TouchableOpacity onPress={() => openProfile(userId)} activeOpacity={0.75}>
          <CachedImage
            uri={profile?.avatar_url}
            fallbackUri={`https://i.pravatar.cc/150?u=${userId}`}
            style={styles.commentAvatar}
            recyclingKey={`post-comment-${item.id}-${profile?.avatar_url || 'fallback'}`}
            accessibilityLabel={`${profile?.username || 'Someone'}'s avatar`}
          />
        </TouchableOpacity>
        <View style={styles.commentBubble}>
          <Text style={styles.commentBubbleName}>{profile?.username || 'Someone'}</Text>
          <MentionText
            text={getDetailCommentBody(item)}
            mentions={(item as { mentions?: ContentMention[] }).mentions || []}
            style={styles.commentBubbleText}
            onMentionPress={openProfile}
          />
          <Text style={styles.commentTime}>{getTimeAgo(getDetailCommentCreatedAt(item))}</Text>
        </View>
      </View>
    );
  }, [openProfile]);

  const renderHeader = useCallback(() => {
    if (crawl) {
      return (
        <View>
          <PubCrawlFeedCard
            crawl={crawl}
            currentUserId={currentUserId}
            isCheering={cheering}
            onToggleCheer={toggleCrawlCheers}
            onOpenCheers={() => {}}
            onOpenComments={openComments}
            onOpenProfile={openProfile}
            onImagePress={setViewingImageUrl}
          />
          <View style={styles.commentsHeader}>
            <MessageCircle color={colors.primary} size={17} />
            <Text style={styles.commentsHeaderText}>
              {crawl.commentsCount > 0
                ? `${crawl.commentsCount} ${crawl.commentsCount === 1 ? 'Comment' : 'Comments'}`
                : 'Comments'}
            </Text>
          </View>
        </View>
      );
    }

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
  }, [cheering, crawl, currentUserId, deleteSession, editSession, openComments, openProfile, session, toggleCheers, toggleCrawlCheers]);

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
      ) : notFound || (!session && !crawl) ? (
        <View style={styles.emptyState}>
          <Text style={typography.h3}>Post unavailable</Text>
          <Text style={styles.emptyText}>This post may have been deleted.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            ref={listRef}
            data={(session?.comments || crawl?.comments || []) as DetailComment[]}
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
            <MentionComposer
              inputRef={composerRef}
              value={commentDraft}
              onChangeText={setCommentDraft}
              mentions={commentMentions}
              onMentionsChange={setCommentMentions}
              currentUserId={currentUserId}
              containerStyle={styles.commentComposerInputContainer}
              inputStyle={styles.commentComposerInput}
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
  commentComposerInputContainer: {
    flex: 1,
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
