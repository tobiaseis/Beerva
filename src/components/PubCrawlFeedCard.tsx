import React, { useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Beer, ChevronDown, ChevronUp, MapPin, MessageCircle } from 'lucide-react-native';

import { PubCrawl, calculatePubCrawlSummary } from '../lib/pubCrawls';
import { getBeerLine } from '../lib/sessionBeers';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { CachedImage } from './CachedImage';
import { PubCrawlMediaCarousel } from './PubCrawlMediaCarousel';
import { Surface } from './Surface';

const beervaLogo = require('../../assets/beerva-header-logo.png');
const cheersLogoSource = Platform.OS === 'web' ? { uri: '/beerva-icon-192.png' } : beervaLogo;

type Props = {
  crawl: PubCrawl;
  currentUserId: string | null;
  isCheering?: boolean;
  onToggleCheer: (crawl: PubCrawl) => void;
  onOpenComments: (crawl: PubCrawl) => void;
  onOpenCheers: (crawl: PubCrawl) => void;
  onOpenProfile: (userId: string) => void;
  onImagePress?: (url: string) => void;
};

type CheersLogoProps = {
  muted?: boolean;
};

const getTimeAgo = (dateString: string | null) => {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
};

const formatStatNumber = (value: number) => (
  Number.isInteger(value) ? String(value) : value.toFixed(1)
);

const getCheersLabel = (count: number) => `${count} ${count === 1 ? 'Cheer' : 'Cheers'}`;
const getCommentsLabel = (count: number) => `${count} ${count === 1 ? 'Comment' : 'Comments'}`;

const CheersLogo = React.memo(({ muted = false }: CheersLogoProps) => {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return (
      <View style={[styles.cheersLogoFallback, styles.cheersLogo, muted ? styles.cheersLogoMuted : null]}>
        <Beer color={colors.primary} size={16} />
      </View>
    );
  }

  return (
    <Image
      source={cheersLogoSource}
      style={[styles.cheersLogo, muted ? styles.cheersLogoMuted : null]}
      onError={() => setImageFailed(true)}
    />
  );
});

export const PubCrawlFeedCard = ({
  crawl,
  currentUserId,
  isCheering = false,
  onToggleCheer,
  onOpenComments,
  onOpenCheers,
  onOpenProfile,
  onImagePress,
}: Props) => {
  const [statsExpanded, setStatsExpanded] = useState(false);
  const summary = calculatePubCrawlSummary(crawl.stops);
  const username = crawl.username || 'Unknown';
  const isOwnPost = crawl.userId === currentUserId;
  const hasCheered = currentUserId ? crawl.cheerProfiles.some((profile) => profile.id === currentUserId) : false;
  const latestComments = crawl.comments.slice(-2);
  const cheerNames = crawl.cheerProfiles
    .slice(0, 3)
    .map((profile) => profile.username || 'Someone')
    .join(', ');
  const cheerPeople = `${crawl.cheersCount} ${crawl.cheersCount === 1 ? 'person' : 'people'}`;
  const cheerSummary = cheerNames
    ? `Cheers from ${cheerNames}${crawl.cheersCount > 3 ? ` +${crawl.cheersCount - 3}` : ''}`
    : `Cheers from ${cheerPeople}`;
  const routeText = summary.routeLabel || 'Pub Crawl';
  const drinkSummary = `${summary.barCount} ${summary.barCount === 1 ? 'bar' : 'bars'} - ${summary.drinkCount} ${summary.drinkCount === 1 ? 'drink' : 'drinks'} - ${formatStatNumber(summary.truePints)} true pints`;

  return (
    <Surface padded={false} style={styles.card}>
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={styles.profileLink}
          onPress={() => onOpenProfile(crawl.userId)}
          activeOpacity={0.75}
        >
          <CachedImage
            uri={crawl.avatarUrl}
            fallbackUri={`https://i.pravatar.cc/150?u=${crawl.userId}`}
            style={styles.avatar}
            recyclingKey={`avatar-${crawl.userId}-${crawl.avatarUrl || 'fallback'}`}
            accessibilityLabel={`${username}'s avatar`}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{username}</Text>
            <Text style={styles.timeText}>{getTimeAgo(crawl.publishedAt || crawl.createdAt)}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.crawlBadge}>
          <Text style={styles.crawlBadgeText}>Pub Crawl</Text>
        </View>
      </View>

      <View style={styles.imagePressable}>
        <PubCrawlMediaCarousel crawl={crawl} onImagePress={onImagePress} />
      </View>

      <View style={styles.cardContent}>
        <View style={styles.sessionSummary}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryIcon}>
              <MapPin color={colors.primary} size={15} />
            </View>
            <Text style={styles.summaryLocationText} numberOfLines={2}>{routeText}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Image source={beervaLogo} style={styles.inlineLogoSmall} />
            <Text style={styles.summaryDrinkText} numberOfLines={2}>{drinkSummary}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.statsToggle}
          onPress={() => setStatsExpanded((previous) => !previous)}
          activeOpacity={0.74}
          accessibilityRole="button"
          accessibilityLabel={statsExpanded ? 'Hide pub crawl stats' : 'Show more pub crawl stats'}
          accessibilityState={{ expanded: statsExpanded }}
        >
          <Text style={styles.statsToggleText}>{statsExpanded ? 'Hide stats' : 'More stats'}</Text>
          {statsExpanded ? (
            <ChevronUp color={colors.primary} size={16} />
          ) : (
            <ChevronDown color={colors.primary} size={16} />
          )}
        </TouchableOpacity>

        {statsExpanded ? (
          <View style={styles.statsPanel}>
            <View style={styles.detailGrid}>
              <View style={styles.detailPill}>
                <Text style={styles.detailLabel}>Bars</Text>
                <Text style={styles.detailValue}>{summary.barCount}</Text>
              </View>
              <View style={styles.detailPill}>
                <Text style={styles.detailLabel}>Drinks</Text>
                <Text style={styles.detailValue}>{summary.drinkCount}</Text>
              </View>
              <View style={styles.detailPill}>
                <Text style={styles.detailLabel}>True Pints</Text>
                <Text style={styles.detailValue}>{formatStatNumber(summary.truePints)}</Text>
              </View>
              {summary.averageAbv !== null ? (
                <View style={styles.detailPill}>
                  <Text style={styles.detailLabel}>Avg ABV</Text>
                  <Text style={styles.detailValue}>{formatStatNumber(summary.averageAbv)}%</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.stopBreakdown}>
              {crawl.stops.map((stop) => (
                <View key={stop.id} style={styles.stopSection}>
                  <View style={styles.stopHeader}>
                    <View style={styles.stopNumber}>
                      <Text style={styles.stopNumberText}>{stop.stopOrder}</Text>
                    </View>
                    <Text style={styles.stopName} numberOfLines={1}>{stop.pubName}</Text>
                    <Text style={styles.stopDrinksCount}>{stop.beers.length} drinks</Text>
                  </View>

                  {stop.comment ? (
                    <Text style={styles.stopComment} numberOfLines={2}>{stop.comment}</Text>
                  ) : null}

                  {stop.beers.length > 0 ? (
                    <View style={styles.beerBreakdown}>
                      {stop.beers.map((beer) => (
                        <Text key={beer.id || `${stop.id}-${beer.beerName}`} style={styles.beerBreakdownText}>
                          {getBeerLine({
                            beer_name: beer.beerName,
                            volume: beer.volume,
                            quantity: beer.quantity,
                            abv: beer.abv,
                          } as any)}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {crawl.cheersCount > 0 || crawl.commentsCount > 0 ? (
        <View style={styles.engagementPanel}>
          {crawl.cheersCount > 0 ? (
            <TouchableOpacity
              style={styles.cheerSummaryRow}
              onPress={() => onOpenCheers(crawl)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={`View ${getCheersLabel(crawl.cheersCount).toLowerCase()}`}
            >
              <CheersLogo />
              <Text style={styles.cheerSummaryText} numberOfLines={1}>
                {cheerSummary}
              </Text>
            </TouchableOpacity>
          ) : null}

          {latestComments.length > 0 ? (
            <View style={styles.commentPreviewList}>
              {latestComments.map((comment) => (
                <TouchableOpacity
                  key={comment.id}
                  style={styles.commentPreviewRow}
                  onPress={() => onOpenComments(crawl)}
                  activeOpacity={0.72}
                >
                  <Text style={styles.commentPreviewText} numberOfLines={2}>
                    <Text style={styles.commentPreviewName}>{comment.profile?.username || 'Someone'} </Text>
                    {comment.body}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => onOpenComments(crawl)} activeOpacity={0.72}>
                <Text style={styles.viewCommentsText}>
                  {crawl.commentsCount > latestComments.length
                    ? `View all ${getCommentsLabel(crawl.commentsCount).toLowerCase()}`
                    : getCommentsLabel(crawl.commentsCount)}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <View style={styles.actionWrapper}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              hasCheered ? styles.actionBtnActive : null,
              isOwnPost ? styles.actionBtnDisabled : null,
            ]}
            onPress={() => onToggleCheer(crawl)}
            disabled={isOwnPost || isCheering || !currentUserId}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={`Give cheers to ${username}`}
            accessibilityState={{ disabled: isOwnPost || isCheering || !currentUserId, selected: hasCheered }}
          >
            <CheersLogo muted={!hasCheered} />
            <Text style={[styles.actionText, hasCheered ? styles.actionTextActive : null]}>
              {getCheersLabel(crawl.cheersCount)}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onOpenComments(crawl)}
          disabled={!currentUserId}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`Open comments for ${username}'s pub crawl`}
        >
          <MessageCircle color={colors.textMuted} size={19} />
          <Text style={styles.actionText}>{getCommentsLabel(crawl.commentsCount)}</Text>
        </TouchableOpacity>
      </View>
    </Surface>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  profileLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    ...typography.h3,
    fontSize: 16,
  },
  timeText: {
    ...typography.caption,
    marginTop: 2,
  },
  crawlBadge: {
    minHeight: 28,
    marginLeft: 10,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crawlBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  imagePressable: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  inlineLogoSmall: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
  },
  cheersLogo: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  cheersLogoMuted: {
    opacity: 0.55,
  },
  cheersLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: spacing.md,
  },
  sessionSummary: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 8,
  },
  summaryIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  summaryLocationText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    fontWeight: '800',
    lineHeight: 22,
  },
  summaryDrinkText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    lineHeight: 22,
  },
  statsToggle: {
    minHeight: 34,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statsToggleText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '900',
  },
  statsPanel: {
    gap: spacing.sm,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailPill: {
    flex: 1,
    flexBasis: 94,
    minHeight: 58,
    minWidth: 0,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0,
    fontWeight: '800',
  },
  detailValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  stopBreakdown: {
    gap: 8,
  },
  stopSection: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumberText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '900',
  },
  stopName: {
    ...typography.body,
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontWeight: '800',
  },
  stopDrinksCount: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  stopComment: {
    ...typography.caption,
    color: colors.text,
    marginTop: 8,
    lineHeight: 18,
  },
  beerBreakdown: {
    paddingTop: 8,
    paddingLeft: 32,
    gap: 5,
  },
  beerBreakdownText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  engagementPanel: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: 10,
  },
  cheerSummaryRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cheerSummaryText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
    fontWeight: '800',
  },
  commentPreviewList: {
    gap: 6,
  },
  commentPreviewRow: {
    minHeight: 22,
    justifyContent: 'center',
  },
  commentPreviewText: {
    ...typography.caption,
    color: colors.text,
    lineHeight: 18,
  },
  commentPreviewName: {
    color: colors.text,
    fontWeight: '800',
  },
  viewCommentsText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  cardFooter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    gap: 8,
  },
  actionWrapper: {
    flex: 1,
    minWidth: 0,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  actionBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
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
