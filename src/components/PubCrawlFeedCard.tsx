import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Image } from 'react-native';
import { MapPin, MessageSquare, GlassWater } from 'lucide-react-native';
import { PubCrawl, calculatePubCrawlSummary } from '../lib/pubCrawls';
import { PubCrawlMediaCarousel } from './PubCrawlMediaCarousel';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, shadows, spacing } from '../theme/layout';
import { getBeerLine } from '../lib/sessionBeers';

const beervaLogo = require('../../assets/beerva-header-logo.png');

type Props = {
  crawl: PubCrawl;
  currentUserId: string;
  onToggleCheer: (crawl: PubCrawl) => void;
  onOpenComments: (crawl: PubCrawl) => void;
};

export const PubCrawlFeedCard = ({ crawl, currentUserId, onToggleCheer, onOpenComments, onImagePress }: Props & { onImagePress?: (url: string) => void }) => {
  const [statsExpanded, setStatsExpanded] = useState(false);
  const summary = calculatePubCrawlSummary(crawl.stops);
  const hasCheered = crawl.cheerProfiles.some(p => p.id === currentUserId);
  const username = crawl.username || 'Unknown User';

  const routeText = crawl.stops.length > 0 
    ? `${crawl.stops[0].pubName} to ${crawl.stops[crawl.stops.length - 1].pubName}`
    : 'Pub Crawl';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.profileLink}>
          {crawl.avatarUrl ? (
            <Image source={{ uri: crawl.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder} />
          )}
          <View style={styles.userInfo}>
            <Text style={styles.username} numberOfLines={1}>{username}</Text>
            <Text style={styles.timeText}>
              {crawl.publishedAt ? new Date(crawl.publishedAt).toLocaleDateString() : 'Just now'}
            </Text>
          </View>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PUB CRAWL</Text>
        </View>
      </View>

      <View style={styles.summaryBox}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.barCount}</Text>
          <Text style={styles.summaryLabel}>Bars</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.drinkCount}</Text>
          <Text style={styles.summaryLabel}>Drinks</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.truePints}</Text>
          <Text style={styles.summaryLabel}>True Pints</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.averageAbv !== null ? summary.averageAbv.toFixed(1) + '%' : '-'}</Text>
          <Text style={styles.summaryLabel}>Avg ABV</Text>
        </View>
      </View>

      <View style={styles.routeBox}>
        <MapPin color={colors.primary} size={16} />
        <Text style={styles.routeText} numberOfLines={2}>{routeText}</Text>
      </View>

      <View style={styles.mediaContainer}>
        <PubCrawlMediaCarousel crawl={crawl} onImagePress={onImagePress} />
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => onToggleCheer(crawl)}
          activeOpacity={0.7}
        >
          <GlassWater 
            color={hasCheered ? colors.primary : colors.textMuted} 
            size={22}
            fill={hasCheered ? colors.primary : 'none'}
          />
          <Text style={[styles.actionText, hasCheered && styles.actionTextActive]}>
            {crawl.cheersCount > 0 ? crawl.cheersCount : 'Cheer'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => onOpenComments(crawl)}
          activeOpacity={0.7}
        >
          <MessageSquare color={colors.textMuted} size={22} />
          <Text style={styles.actionText}>
            {crawl.commentsCount > 0 ? crawl.commentsCount : 'Comment'}
          </Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity 
          style={styles.moreStatsButton}
          onPress={() => setStatsExpanded(!statsExpanded)}
        >
          <Text style={styles.moreStatsText}>{statsExpanded ? 'Less stats' : 'More stats'}</Text>
        </TouchableOpacity>
      </View>

      {statsExpanded && (
        <View style={styles.expandedStats}>
          {crawl.stops.map((stop) => (
            <View key={stop.id} style={styles.stopSection}>
              <View style={styles.stopHeader}>
                <View style={styles.stopNumber}>
                  <Text style={styles.stopNumberText}>{stop.stopOrder}</Text>
                </View>
                <Text style={styles.stopName}>{stop.pubName}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.stopDrinksCount}>{stop.beers.length} drinks</Text>
              </View>

              {stop.comment && (
                <Text style={styles.stopComment}>"{stop.comment}"</Text>
              )}

              <View style={styles.stopBeers}>
                {stop.beers.map((beer) => (
                  <View key={beer.id} style={styles.beerRow}>
                    <Image source={beervaLogo} style={styles.beerRowLogo} />
                    <View style={styles.beerRowText}>
                      <Text style={styles.beerRowTitle}>{beer.beerName}</Text>
                      <Text style={styles.beerRowMeta}>{getBeerLine({
                        beer_name: beer.beerName,
                        volume: beer.volume,
                        quantity: beer.quantity,
                        abv: beer.abv
                      } as any)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
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
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    ...typography.h3,
    fontSize: 16,
  },
  timeText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  badge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  badgeText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '800',
  },
  summaryBox: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: spacing.md,
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    ...typography.h3,
    color: colors.primary,
  },
  summaryLabel: {
    ...typography.caption,
    fontSize: 10,
    marginTop: 2,
  },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: 8,
    paddingHorizontal: 4,
  },
  routeText: {
    ...typography.body,
    flex: 1,
    fontWeight: '600',
  },
  mediaContainer: {
    marginHorizontal: -spacing.md,
    marginBottom: spacing.md,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  actionText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '600',
  },
  actionTextActive: {
    color: colors.primary,
  },
  moreStatsButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  moreStatsText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  expandedStats: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.md,
  },
  stopSection: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
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
    color: colors.surface,
    fontWeight: '800',
  },
  stopName: {
    ...typography.body,
    fontWeight: '700',
    flex: 1,
  },
  stopDrinksCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  stopComment: {
    ...typography.body,
    fontStyle: 'italic',
    color: colors.text,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  stopBeers: {
    gap: 8,
  },
  beerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  beerRowLogo: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  beerRowText: {
    flex: 1,
  },
  beerRowTitle: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  beerRowMeta: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 1,
  },
});
