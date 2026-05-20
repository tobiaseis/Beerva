import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Trophy } from 'lucide-react-native';

import { CachedImage } from './CachedImage';
import { formatOfficialWinnerStat, OfficialFeedPost } from '../lib/officialFeedPosts';
import { colors } from '../theme/colors';
import { feedCardColors } from '../theme/feedCard';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type OfficialFeedPostCardProps = {
  post: OfficialFeedPost;
  onOpenProfile: (userId: string) => void;
};

export const OfficialFeedPostCard = ({ post, onOpenProfile }: OfficialFeedPostCardProps) => (
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

    <View style={styles.statGrid}>
      <Text style={styles.statText}>{formatOfficialWinnerStat('True pints', post.truePints)}</Text>
      <Text style={styles.statText}>{formatOfficialWinnerStat('Average ABV', post.averageAbv, '%')}</Text>
      <Text style={styles.statText}>{formatOfficialWinnerStat('Drinks', post.drinkCount)}</Text>
      <Text style={styles.statText}>{formatOfficialWinnerStat('Sessions', post.sessionCount)}</Text>
    </View>
  </View>
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
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statText: {
    ...typography.caption,
    color: colors.text,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
});
