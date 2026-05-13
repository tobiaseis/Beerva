import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Beer, ChevronDown, ChevronUp, MapPin, MessageCircle } from 'lucide-react-native';

import { PubCrawl, PubCrawlStop, calculatePubCrawlSummary } from '../lib/pubCrawls';
import { getSessionBeerBreakdownLines } from '../lib/sessionBeers';
import { colors } from '../theme/colors';
import { feedCardColors, feedCardMetrics, getCompactFeedActionCount } from '../theme/feedCard';
import { radius, shadows } from '../theme/layout';
import { typography } from '../theme/typography';
import { CachedImage } from './CachedImage';
import { PubCrawlMediaCarousel } from './PubCrawlMediaCarousel';
import { Surface } from './Surface';

const beervaLogo = require('../../assets/beerva-header-logo.png');
const cheersLogoSource = beervaLogo;

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

const getStopDrinkCount = (stop: PubCrawlStop) => (
  stop.beers.reduce((sum, beer) => sum + Math.max(1, beer.quantity || 1), 0)
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
              {crawl.stops.map((stop) => {
                const stopDrinkCount = getStopDrinkCount(stop);
                const beerBreakdownLines = getSessionBeerBreakdownLines(
                  stop.beers.map((beer) => ({
                    beer_name: beer.beerName,
                    volume: beer.volume,
                    quantity: beer.quantity,
                  }))
                );

                return (
                  <View key={stop.id} style={styles.stopSection}>
                    <View style={styles.stopHeader}>
                      <View style={styles.stopNumber}>
                        <Text style={styles.stopNumberText}>{stop.stopOrder}</Text>
                      </View>
                      <Text style={styles.stopName} numberOfLines={1}>{stop.pubName}</Text>
                      <Text style={styles.stopDrinksCount}>
                        {stopDrinkCount} {stopDrinkCount === 1 ? 'drink' : 'drinks'}
                      </Text>
                    </View>

                    {stop.comment ? (
                      <Text style={styles.stopComment} numberOfLines={2}>{stop.comment}</Text>
                    ) : null}

                    {beerBreakdownLines.length > 0 ? (
                      <View style={styles.beerBreakdown}>
                        {beerBreakdownLines.map((line, index) => (
                          <Text key={`${stop.id}-${line}-${index}`} style={styles.beerBreakdownText}>
                            {line}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {crawl.hangoverScore !== null ? (
          <View style={styles.hangoverBadge}>
            <Text style={styles.hangoverBadgeLabel}>Hangover</Text>
            <Text style={styles.hangoverBadgeValue}>{crawl.hangoverScore}/10</Text>
          </View>
        ) : null}
      </View>

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
              {getCompactFeedActionCount(crawl.cheersCount)}
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
          <Text style={styles.actionText}>{getCompactFeedActionCount(crawl.commentsCount)}</Text>
        </TouchableOpacity>
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
              {crawl.cheerProfiles.length > 0 ? (
                <View style={styles.cheerAvatarStack}>
                  {crawl.cheerProfiles.slice(0, 3).map((profile, index) => (
                    <CachedImage
                      key={profile.id}
                      uri={profile.avatarUrl}
                      fallbackUri={`https://i.pravatar.cc/150?u=${profile.id}`}
                      style={[styles.cheerAvatar, index > 0 ? styles.cheerAvatarOverlap : null]}
                      recyclingKey={`crawl-cheer-${crawl.id}-${profile.id}-${profile.avatarUrl || 'fallback'}`}
                      accessibilityLabel={`${profile.username || 'Someone'} gave cheers`}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.cheerAvatarStack}>
                  <CheersLogo />
                </View>
              )}
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
    </Surface>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: feedCardMetrics.cardRadius,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: feedCardColors.card,
    borderColor: feedCardColors.border,
    ...shadows.card,
    boxShadow: '0 10px 26px rgba(2, 6, 23, 0.18)',
  },
  cardHeader: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: 'center',
  },
  profileLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 1,
    borderColor: feedCardColors.border,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    ...typography.h3,
    fontSize: 15,
  },
  timeText: {
    ...typography.caption,
    marginTop: 2,
  },
  crawlBadge: {
    minHeight: 24,
    marginLeft: 10,
    paddingHorizontal: 8,
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
    marginHorizontal: 0,
    borderRadius: feedCardMetrics.mediaRadius,
    overflow: 'hidden',
    backgroundColor: colors.cardMuted,
  },
  inlineLogoSmall: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
  },
  cheersLogo: {
    width: 20,
    height: 20,
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
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 6,
  },
  sessionSummary: {
    gap: 2,
    paddingVertical: 0,
  },
  summaryRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 8,
  },
  summaryIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: feedCardColors.metadataIconBackground,
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
    minHeight: 24,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingRight: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statsToggleText: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  statsPanel: {
    gap: 8,
    paddingTop: 4,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailPill: {
    flex: 1,
    flexBasis: 78,
    minHeight: 48,
    minWidth: 0,
    borderRadius: radius.md,
    backgroundColor: feedCardColors.statBackground,
    borderWidth: 1,
    borderColor: feedCardColors.metadataDivider,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0,
    fontWeight: '800',
  },
  detailValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  hangoverBadge: {
    alignSelf: 'flex-end',
    minWidth: 80,
    minHeight: 42,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'flex-end',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.32)',
  },
  hangoverBadgeLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  hangoverBadgeValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  stopBreakdown: {
    gap: 7,
  },
  stopSection: {
    borderRadius: radius.md,
    backgroundColor: feedCardColors.statBackground,
    borderWidth: 1,
    borderColor: feedCardColors.metadataDivider,
    paddingHorizontal: 9,
    paddingVertical: 9,
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
    paddingTop: 7,
    paddingLeft: 28,
    gap: 5,
  },
  beerBreakdownText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  engagementPanel: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 14,
    gap: 7,
  },
  cheerSummaryRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cheerAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 20,
  },
  cheerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: feedCardColors.card,
    backgroundColor: colors.cardMuted,
  },
  cheerAvatarOverlap: {
    marginLeft: -7,
  },
  cheerSummaryText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
    fontWeight: '800',
  },
  commentPreviewList: {
    gap: 4,
  },
  commentPreviewRow: {
    minHeight: 20,
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
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionWrapper: {
    alignSelf: 'flex-start',
  },
  actionBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 2,
    borderRadius: radius.pill,
    gap: 6,
  },
  actionBtnActive: {
    backgroundColor: feedCardColors.actionActiveBackground,
  },
  actionBtnDisabled: {
    opacity: 0.62,
  },
  actionText: {
    ...typography.bodyMuted,
    marginLeft: 0,
    fontSize: 15,
    fontWeight: '800',
  },
  actionTextActive: {
    color: colors.primary,
  },
});
