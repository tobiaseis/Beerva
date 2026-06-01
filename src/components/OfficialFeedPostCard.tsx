import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Trophy } from 'lucide-react-native';

import { CachedImage } from './CachedImage';
import { ChallengeSummary } from '../lib/challenges';
import {
  isOfficialWinnerPost,
  OfficialFeedPost,
} from '../lib/officialFeedPosts';
import { colors } from '../theme/colors';
import { feedCardColors } from '../theme/feedCard';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type OfficialFeedPostCardProps = {
  post: OfficialFeedPost;
  linkedChallenge?: ChallengeSummary | null;
  onJoinChallenge?: (challenge: ChallengeSummary) => Promise<void>;
  onOpenChallenge?: (challengeSlug: string) => void;
  onOpenProfile: (userId: string) => void;
  onImagePress?: (url: string) => void;
};

const WinnerOfficialFeedPostCard = ({
  post,
  onOpenProfile,
}: Pick<OfficialFeedPostCardProps, 'post' | 'onOpenProfile'>) => (
  <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.officialBadge}>
        <CheckCircle2 color={colors.primary} size={15} />
        <Text style={styles.officialText}>Official Beerva</Text>
      </View>
      <Trophy color={colors.primary} size={20} />
    </View>

    <Text style={styles.title}>{post.title}</Text>
    <Text style={styles.body}>{post.body}</Text>

    {post.winnerUserId ? (
      <Pressable
        style={styles.winnerRow}
        onPress={() => post.winnerUserId && onOpenProfile(post.winnerUserId)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${post.winnerUsername || 'winner'} profile`}
      >
        <CachedImage
          uri={post.winnerAvatarUrl}
          fallbackUri={`https://i.pravatar.cc/150?u=${post.winnerUserId}`}
          style={styles.avatar}
          recyclingKey={`official-winner-${post.id}-${post.winnerAvatarUrl || 'fallback'}`}
        />
        <View style={styles.winnerCopy}>
          <Text style={styles.winnerLabel}>Winner</Text>
          <Text style={styles.winnerName} numberOfLines={1}>{post.winnerUsername || 'Beer Lover'}</Text>
        </View>
      </Pressable>
    ) : null}

  </View>
);

const AnnouncementOfficialFeedPostCard = ({
  post,
  linkedChallenge,
  onJoinChallenge,
  onOpenChallenge,
  onImagePress,
}: Omit<OfficialFeedPostCardProps, 'onOpenProfile'>) => {
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const challengeSlug = linkedChallenge?.slug || post.challengeSlug;

  const handleJoin = async () => {
    if (!linkedChallenge || !onJoinChallenge || joining || linkedChallenge.joined || !linkedChallenge.joinOpen) return;
    setJoining(true);
    setJoinError(null);
    try {
      await onJoinChallenge(linkedChallenge);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Could not join challenge.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.officialBadge}>
          <CheckCircle2 color={colors.primary} size={15} />
          <Text style={styles.officialText}>Official Beerva</Text>
        </View>
      </View>

      {challengeSlug ? (
        <Pressable onPress={() => onOpenChallenge?.(challengeSlug)} accessibilityRole="button">
          <Text style={styles.title}>{post.title}</Text>
        </Pressable>
      ) : (
        <Text style={styles.title}>{post.title}</Text>
      )}
      <Text style={styles.body}>{post.body}</Text>

      {post.imageUrl ? (
        <Pressable onPress={() => onImagePress?.(post.imageUrl as string)} accessibilityRole="button">
          <CachedImage
            uri={post.imageUrl}
            style={styles.announcementImage}
            recyclingKey={`official-${post.id}-${post.imageUrl}`}
          />
        </Pressable>
      ) : null}

      {challengeSlug ? (
        <View style={styles.challengeActions}>
          {linkedChallenge?.joined ? (
            <View style={styles.joinedPill}>
              <CheckCircle2 color={colors.primary} size={15} />
              <Text style={styles.joinedPillText}>Joined</Text>
            </View>
          ) : linkedChallenge?.joinOpen ? (
            <Pressable style={styles.joinButton} onPress={handleJoin} disabled={joining}>
              <Text style={styles.joinButtonText}>{joining ? 'Joining...' : 'Join challenge'}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.viewButton} onPress={() => onOpenChallenge?.(challengeSlug)}>
            <Text style={styles.viewButtonText}>View challenge</Text>
          </Pressable>
        </View>
      ) : null}

      {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
    </View>
  );
};

export const OfficialFeedPostCard = (props: OfficialFeedPostCardProps) => (
  isOfficialWinnerPost(props.post)
    ? <WinnerOfficialFeedPostCard post={props.post} onOpenProfile={props.onOpenProfile} />
    : <AnnouncementOfficialFeedPostCard {...props} />
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: feedCardColors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 14,
    gap: spacing.sm,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  officialBadge: {
    minHeight: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  officialText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '900',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.text,
  },
  announcementImage: {
    width: '100%',
    height: 210,
    borderRadius: radius.md,
    backgroundColor: colors.cardMuted,
  },
  challengeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  joinButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '900',
  },
  viewButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '900',
  },
  joinedPill: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  joinedPillText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '900',
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  winnerRow: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardMuted,
  },
  winnerCopy: {
    flex: 1,
    minWidth: 0,
  },
  winnerLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  winnerName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '900',
  },
  },
});
