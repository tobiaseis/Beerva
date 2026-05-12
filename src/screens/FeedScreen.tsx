import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, RefreshControl, TouchableOpacity, Pressable, Alert, Platform, Animated, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Beer, ChevronDown, ChevronUp, Edit3, MapPin, Trash2, Bell, AlertTriangle, RefreshCw, MessageCircle, Send, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { confirmDestructive } from '../lib/dialogs';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { CachedImage } from '../components/CachedImage';
import { deletePublicImageUrl } from '../lib/imageUpload';
import { Surface } from '../components/Surface';
import { SkeletonFeedCard } from '../components/Skeleton';
import { radius, shadows, spacing } from '../theme/layout';
import { hapticLight, hapticMedium, hapticWarning } from '../lib/haptics';
import { useNotifications } from '../lib/notificationsContext';
import { EmptyIllustration } from '../components/EmptyIllustration';
import { getBeerLine, getSessionBeerSummary, SessionBeer } from '../lib/sessionBeers';
import { getVolumeMl, TrophyDefinition } from '../lib/profileStats';
import { TrophyUnlockModal } from '../components/TrophyUnlockModal';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { openMaps } from '../lib/maps';
import { getErrorMessage, withTimeout } from '../lib/timeouts';
import { PubCrawlFeedCard } from '../components/PubCrawlFeedCard';
import { PubCrawl, PubCrawlComment } from '../lib/pubCrawls';
import { fetchPublishedPubCrawlsForFeedPage, togglePubCrawlCheers, addPubCrawlComment } from '../lib/pubCrawlsApi';

const beervaLogo = require('../../assets/beerva-header-logo.png');
const cheersLogoSource = Platform.OS === 'web' ? { uri: '/beerva-icon-192.png' } : beervaLogo;

type SessionCheer = {
  session_id: string;
  user_id: string;
  created_at?: string | null;
};

type FollowRow = {
  following_id: string;
};

type ProfilePreview = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

type FeedComment = {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  profiles?: ProfilePreview | null;
};

type FeedSession = {
  id: string;
  user_id: string;
  pub_id?: string | null;
  pub_name: string;
  beer_name: string;
  volume: string | null;
  quantity: number | null;
  abv: number | null;
  comment: string | null;
  image_url: string | null;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  published_at?: string | null;
  edited_at?: string | null;
  hangover_score?: number | null;
  created_at: string;
  session_beers: SessionBeer[];
  profiles?: {
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  cheer_profiles: ProfilePreview[];
  comments: FeedComment[];
  comments_count: number;
  cheers_count: number;
  has_cheered: boolean;
};

export type FeedItem =
  | { type: 'session'; id: string; publishedAt: string; session: FeedSession }
  | { type: 'pub_crawl'; id: string; publishedAt: string; crawl: PubCrawl };

const isPubCrawlPost = (item: FeedSession | PubCrawl): item is PubCrawl => (
  'userId' in item && 'stops' in item
);

const sortFeedItemsByPublishedAt = (items: FeedItem[]) => (
  [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
);

const PULL_REFRESH_THRESHOLD = 65;
const PULL_MAX_DISTANCE = 110;
const FEED_PAGE_SIZE = 20;
const FEED_REQUEST_TIMEOUT_MS = 15000;

type PullIndicatorProps = {
  pullDistance: number;
  refreshing: boolean;
};

const PullIndicator = ({ pullDistance, refreshing }: PullIndicatorProps) => {
  const spin = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (refreshing) {
      spin.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true }),
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      loopRef.current = null;
    }
    return () => {
      loopRef.current?.stop();
    };
  }, [refreshing, spin]);

  const progress = Math.min(pullDistance / PULL_REFRESH_THRESHOLD, 1);
  const dragRotation = `${progress * 270}deg`;
  const spinRotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotate = refreshing ? spinRotation : dragRotation;
  const opacity = refreshing ? 1 : Math.max(0.35, progress);

  return (
    <View style={[styles.pullIndicator, { height: refreshing ? 56 : pullDistance }]}>
      <Animated.Image
        source={beervaLogo}
        style={[styles.pullLogo, { opacity, transform: [{ rotate }] }]}
      />
    </View>
  );
};

const getDrinkLabel = (item: FeedSession) => {
  if (item.session_beers.length > 0) {
    return getSessionBeerSummary(item.session_beers);
  }

  const volume = item.volume || 'Pint';
  const quantity = item.quantity || 1;
  const drink = quantity > 1 ? `${quantity} x ${volume}` : volume;
  return `${drink} of ${item.beer_name}`;
};

const getSessionBeerCount = (item: FeedSession) => {
  if (item.session_beers.length > 0) {
    return item.session_beers.reduce((sum, beer) => sum + (beer.quantity || 1), 0);
  }

  return item.quantity || 1;
};

const getSessionTruePints = (item: FeedSession) => {
  const beers = item.session_beers.length > 0
    ? item.session_beers
    : [{ volume: item.volume, quantity: item.quantity }];

  const pints = beers.reduce((sum, beer) => {
    const volumeMl = getVolumeMl(beer.volume);
    const quantity = beer.quantity || 1;
    return sum + (volumeMl * quantity / 568);
  }, 0);

  return Math.round(pints * 10) / 10;
};

const getSessionAverageAbv = (item: FeedSession) => {
  const beers = item.session_beers.length > 0
    ? item.session_beers
    : [{ abv: item.abv ?? null, quantity: item.quantity, volume: item.volume }];

  let weightedTotal = 0;
  let volumeTotal = 0;

  beers.forEach((beer) => {
    if (typeof beer.abv !== 'number') return;
    const volumeMl = getVolumeMl(beer.volume);
    const quantity = beer.quantity || 1;
    const countedVolume = volumeMl * quantity;
    weightedTotal += beer.abv * countedVolume;
    volumeTotal += countedVolume;
  });

  if (volumeTotal === 0) return null;
  return Math.round((weightedTotal / volumeTotal) * 10) / 10;
};

const formatStatNumber = (value: number) => (
  Number.isInteger(value) ? String(value) : value.toFixed(1)
);

const getCheersLabel = (count: number) => {
  return `${count} ${count === 1 ? 'Cheer' : 'Cheers'}`;
};

const getCommentsLabel = (count: number) => {
  return `${count} ${count === 1 ? 'Comment' : 'Comments'}`;
};

type CheersLogoProps = {
  size: 'small' | 'action';
  muted?: boolean;
};

const CheersLogo = React.memo(({ size, muted = false }: CheersLogoProps) => {
  const [imageFailed, setImageFailed] = React.useState(false);
  const logoStyle = size === 'action' ? styles.cheersLogo : styles.cheersLogoSmall;
  const fallbackIconSize = size === 'action' ? 16 : 13;

  if (imageFailed) {
    return (
      <View style={[styles.cheersLogoFallback, logoStyle, muted ? styles.cheersLogoMuted : null]}>
        <Beer color={colors.primary} size={fallbackIconSize} />
      </View>
    );
  }

  return (
    <Image
      source={cheersLogoSource}
      style={[logoStyle, muted ? styles.cheersLogoMuted : null]}
      onError={() => setImageFailed(true)}
    />
  );
});

const getTimeAgo = (dateString: string) => {
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

type FeedSessionCardProps = {
  item: FeedSession;
  currentUserId: string | null;
  isCheering: boolean;
  onDeleteSession: (session: FeedSession) => void;
  onEditSession: (session: FeedSession) => void;
  onOpenCheers: (session: FeedSession) => void;
  onOpenComments: (session: FeedSession) => void;
  onOpenProfile: (userId: string) => void;
  onImagePress: (url: string) => void;
  onToggleCheers: (session: FeedSession) => void;
};

const FeedSessionCard = React.memo(({
  item,
  currentUserId,
  isCheering,
  onDeleteSession,
  onEditSession,
  onOpenCheers,
  onOpenComments,
  onOpenProfile,
  onImagePress,
  onToggleCheers,
}: FeedSessionCardProps) => {
  const isOwnPost = item.user_id === currentUserId;
  const username = item.profiles?.username || 'Unknown';
  const latestComments = item.comments.slice(-2);
  const cheerNames = item.cheer_profiles
    .slice(0, 3)
    .map((profile) => profile.username || 'Someone')
    .join(', ');
  const cheerPeople = `${item.cheers_count} ${item.cheers_count === 1 ? 'person' : 'people'}`;
  const cheerSummary = cheerNames
    ? `Cheers from ${cheerNames}${item.cheers_count > 3 ? ` +${item.cheers_count - 3}` : ''}`
    : `Cheers from ${cheerPeople}`;
  const beerCount = getSessionBeerCount(item);
  const truePints = getSessionTruePints(item);
  const averageAbv = getSessionAverageAbv(item);
  const [statsExpanded, setStatsExpanded] = React.useState(false);
  const cheersScale = React.useRef(new Animated.Value(1)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const overlayScale = React.useRef(new Animated.Value(0.6)).current;
  const lastTapRef = React.useRef(0);
  const pendingImageOpenRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (pendingImageOpenRef.current) {
      clearTimeout(pendingImageOpenRef.current);
    }
  }, []);

  const playOverlay = React.useCallback(() => {
    overlayOpacity.setValue(0);
    overlayScale.setValue(0.6);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(280),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
      Animated.spring(overlayScale, { toValue: 1.15, tension: 200, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [overlayOpacity, overlayScale]);

  const triggerCheers = React.useCallback(() => {
    hapticMedium();
    Animated.sequence([
      Animated.spring(cheersScale, { toValue: 1.18, tension: 300, friction: 6, useNativeDriver: true }),
      Animated.spring(cheersScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
    onToggleCheers(item);
  }, [cheersScale, item, onToggleCheers]);

  const handleCheersPress = triggerCheers;

  const toggleStats = React.useCallback(() => {
    hapticLight();
    setStatsExpanded((previous) => !previous);
  }, []);

  const handleImagePress = React.useCallback(() => {
    if (!item.image_url) return;

    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      if (pendingImageOpenRef.current) {
        clearTimeout(pendingImageOpenRef.current);
        pendingImageOpenRef.current = null;
      }
      if (isOwnPost || !currentUserId || item.has_cheered) {
        playOverlay();
        return;
      }
      playOverlay();
      triggerCheers();
    } else {
      lastTapRef.current = now;
      if (pendingImageOpenRef.current) {
        clearTimeout(pendingImageOpenRef.current);
      }
      pendingImageOpenRef.current = setTimeout(() => {
        pendingImageOpenRef.current = null;
        lastTapRef.current = 0;
        onImagePress(item.image_url as string);
      }, 280);
    }
  }, [currentUserId, isOwnPost, item.has_cheered, item.image_url, onImagePress, playOverlay, triggerCheers]);

  return (
    <Surface padded={false} style={styles.card}>
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={styles.profileLink}
          onPress={() => onOpenProfile(item.user_id)}
          activeOpacity={0.75}
        >
          <CachedImage
            uri={item.profiles?.avatar_url}
            fallbackUri={`https://i.pravatar.cc/150?u=${item.user_id}`}
            style={styles.avatar}
            recyclingKey={`avatar-${item.user_id}-${item.profiles?.avatar_url || 'fallback'}`}
            accessibilityLabel={`${username}'s avatar`}
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{username}</Text>
            <Text style={styles.timeText}>{getTimeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
        {isOwnPost ? (
          <View style={styles.ownerActions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => onEditSession(item)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Edit post"
            >
              <Edit3 color={colors.primary} size={17} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => onDeleteSession(item)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Delete post"
            >
              <Trash2 color={colors.danger} size={18} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {item.comment ? (
        <View style={styles.commentTop}>
          <Text style={styles.commentText}>{item.comment}</Text>
        </View>
      ) : null}

      {item.image_url ? (
        <Pressable
          onPress={handleImagePress}
          style={({ pressed }) => [styles.imagePressable, pressed ? styles.imagePressed : null]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${username}'s session photo`}
          accessibilityHint="Tap to view the full image. Press twice quickly to give cheers."
        >
          <View style={styles.imageWrap}>
            <CachedImage
              uri={item.image_url}
              style={styles.feedImage}
              recyclingKey={`session-${item.id}-${item.image_url}`}
              accessibilityLabel={`${username}'s beer session photo`}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.cheerOverlay,
                { opacity: overlayOpacity, transform: [{ scale: overlayScale }] },
              ]}
            >
              <Image source={beervaLogo} style={styles.cheerOverlayLogo} />
            </Animated.View>
          </View>
        </Pressable>
      ) : null}

      <View style={styles.cardContent}>

        <View style={styles.sessionSummary}>
          <TouchableOpacity 
            style={styles.summaryRow}
            onPress={() => openMaps(item.pub_name)}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel={`Open ${item.pub_name} in Maps`}
          >
            <View style={styles.summaryIcon}>
              <MapPin color={colors.primary} size={15} />
            </View>
            <Text style={styles.summaryLocationText} numberOfLines={1}>{item.pub_name}</Text>
          </TouchableOpacity>
          <View style={styles.summaryRow}>
            <Image source={beervaLogo} style={styles.inlineLogoSmall} />
            <Text style={styles.summaryDrinkText} numberOfLines={2}>{getDrinkLabel(item)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.statsToggle}
          onPress={toggleStats}
          activeOpacity={0.74}
          accessibilityRole="button"
          accessibilityLabel={statsExpanded ? 'Hide session stats' : 'Show more session stats'}
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
                <Text style={styles.detailLabel}>Drinks</Text>
                <Text style={styles.detailValue}>{beerCount}</Text>
              </View>
              <View style={styles.detailPill}>
                <Text style={styles.detailLabel}>True Pints</Text>
                <Text style={styles.detailValue}>{formatStatNumber(truePints)}</Text>
              </View>
              {averageAbv !== null ? (
                <View style={styles.detailPill}>
                  <Text style={styles.detailLabel}>Avg ABV</Text>
                  <Text style={styles.detailValue}>{formatStatNumber(averageAbv)}%</Text>
                </View>
              ) : null}
            </View>
            {item.session_beers.length > 1 ? (
              <View style={styles.beerBreakdown}>
                {item.session_beers.map((beer) => (
                  <Text key={beer.id || `${beer.beer_name}-${beer.consumed_at}`} style={styles.beerBreakdownText}>
                    {getBeerLine(beer)}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {item.edited_at ? (
          <Text style={styles.editedText}>Edited</Text>
        ) : null}

        {typeof item.hangover_score === 'number' ? (
          <View style={styles.hangoverBadge}>
            <Text style={styles.hangoverBadgeLabel}>Hangover</Text>
            <Text style={styles.hangoverBadgeValue}>{item.hangover_score}/10</Text>
          </View>
        ) : null}
      </View>

      {item.cheers_count > 0 || item.comments_count > 0 ? (
        <View style={styles.engagementPanel}>
          {item.cheers_count > 0 ? (
            <TouchableOpacity
              style={styles.cheerSummaryRow}
              onPress={() => onOpenCheers(item)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={`View ${getCheersLabel(item.cheers_count).toLowerCase()}`}
            >
              <CheersLogo size="small" />
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
                  onPress={() => onOpenComments(item)}
                  activeOpacity={0.72}
                >
                  <Text style={styles.commentPreviewText} numberOfLines={2}>
                    <Text style={styles.commentPreviewName}>{comment.profiles?.username || 'Someone'} </Text>
                    {comment.body}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => onOpenComments(item)} activeOpacity={0.72}>
                <Text style={styles.viewCommentsText}>
                  {item.comments_count > latestComments.length
                    ? `View all ${getCommentsLabel(item.comments_count).toLowerCase()}`
                    : getCommentsLabel(item.comments_count)}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <Animated.View style={[styles.actionWrapper, { transform: [{ scale: cheersScale }] }]}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              item.has_cheered ? styles.actionBtnActive : null,
              isOwnPost ? styles.actionBtnDisabled : null,
            ]}
            onPress={handleCheersPress}
            disabled={isOwnPost || isCheering || !currentUserId}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={`Give cheers to ${username}`}
            accessibilityState={{ disabled: isOwnPost || isCheering || !currentUserId, selected: item.has_cheered }}
          >
            <CheersLogo size="action" muted={!item.has_cheered} />
            <Text style={[styles.actionText, item.has_cheered ? styles.actionTextActive : null]}>
              {getCheersLabel(item.cheers_count)}
            </Text>
          </TouchableOpacity>
        </Animated.View>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onOpenComments(item)}
          disabled={!currentUserId}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`Open comments for ${username}'s session`}
        >
          <MessageCircle color={colors.textMuted} size={19} />
          <Text style={styles.actionText}>{getCommentsLabel(item.comments_count)}</Text>
        </TouchableOpacity>
      </View>
    </Surface>
  );
});

export const FeedScreen = ({ route }: any) => {
  const navigation = useNavigation<any>();
  const [sessions, setSessions] = useState<FeedItem[]>([]);
  const [unlockedTrophies, setUnlockedTrophies] = useState<TrophyDefinition[]>([]);
  const newlyUnlockedTrophies = route?.params?.newlyUnlockedTrophies;

  useEffect(() => {
    if (newlyUnlockedTrophies?.length > 0) {
      setUnlockedTrophies(newlyUnlockedTrophies);
      navigation.setParams({ newlyUnlockedTrophies: undefined });
    }
  }, [newlyUnlockedTrophies, navigation]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followedUserCount, setFollowedUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cheeringSessionIds, setCheeringSessionIds] = useState<Set<string>>(() => new Set());
  const [commentingSession, setCommentingSession] = useState<FeedSession | PubCrawl | null>(null);
  const [cheersSession, setCheersSession] = useState<FeedSession | PubCrawl | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const { unreadCount } = useNotifications();
  const [pullDistance, setPullDistance] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const sessionsRef = useRef<FeedItem[]>([]);
  const loadedSessionCountRef = useRef(0);
  const loadedCrawlCountRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const refreshingRef = useRef(false);
  const latestRequestIdRef = useRef(0);
  const cheeringSessionIdsRef = useRef<Set<string>>(new Set());
  const scrollOffsetY = useRef(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const flatListRef = useRef<FlatList>(null);

  useScrollToTop(flatListRef);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    cheeringSessionIdsRef.current = cheeringSessionIds;
  }, [cheeringSessionIds]);

  const fetchSessions = useCallback(async ({ reset = false }: { reset?: boolean } = {}) => {
    if (!reset && (loadingMoreRef.current || refreshingRef.current || !hasMoreRef.current)) {
      return;
    }

    const sessionOffset = reset ? 0 : loadedSessionCountRef.current;
    const crawlOffset = reset ? 0 : loadedCrawlCountRef.current;
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const isLatestRequest = () => requestId === latestRequestIdRef.current;

    if (reset) {
      refreshingRef.current = true;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoading(sessionsRef.current.length === 0);
      setFetchError(null);
    } else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }

    try {
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        FEED_REQUEST_TIMEOUT_MS,
        'Feed sign-in check is taking too long.'
      );
      if (!isLatestRequest()) return;

      setCurrentUserId(user?.id || null);

      if (!user) {
        if (!isLatestRequest()) return;
        setSessions([]);
        sessionsRef.current = [];
        loadedSessionCountRef.current = 0;
        loadedCrawlCountRef.current = 0;
        setFollowedUserCount(0);
        setHasMore(false);
        hasMoreRef.current = false;
        return;
      }

      const { data: followsData, error: followsError } = await withTimeout(
        supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id),
        FEED_REQUEST_TIMEOUT_MS,
        'Feed follows are taking too long.'
      );
      if (!isLatestRequest()) return;

      if (followsError) {
        console.error('Feed follows fetch error:', followsError);
      }

      const followingIds = ((followsData || []) as FollowRow[]).map((follow) => follow.following_id);
      const feedUserIds = Array.from(new Set([user.id, ...followingIds]));
      setFollowedUserCount(followingIds.length);

      const [sessionsResult, crawlsResult] = await withTimeout(
        Promise.all([
          supabase
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
              created_at,
              hide_from_feed
            `)
            .in('user_id', feedUserIds)
            .eq('status', 'published')
            .eq('hide_from_feed', false)
            .order('published_at', { ascending: false, nullsFirst: false })
            .range(sessionOffset, sessionOffset + FEED_PAGE_SIZE),
          fetchPublishedPubCrawlsForFeedPage(feedUserIds, FEED_PAGE_SIZE, crawlOffset)
        ]),
        FEED_REQUEST_TIMEOUT_MS,
        'Feed items are taking too long.'
      );

      if (sessionsResult.error) throw sessionsResult.error;
      if (!isLatestRequest()) return;

      const rawRows = (sessionsResult.data || []) as any[];
      const hasNextPage = rawRows.length > FEED_PAGE_SIZE || crawlsResult.hasMore;
      const sessionRows = rawRows.slice(0, FEED_PAGE_SIZE);
      const crawls = crawlsResult.crawls;
      loadedSessionCountRef.current = sessionOffset + sessionRows.length;
      loadedCrawlCountRef.current = crawlOffset + crawlsResult.loadedCount;
      setHasMore(hasNextPage);
      hasMoreRef.current = hasNextPage;

      const sessionIds = sessionRows.map((session) => session.id);

      const [cheersResult, beersResult, commentsResult] = await withTimeout(
        Promise.all([
          sessionIds.length > 0
            ? supabase
                .from('session_cheers')
                .select('session_id, user_id, created_at')
                .in('session_id', sessionIds)
            : Promise.resolve({ data: [] as SessionCheer[], error: null }),
          sessionIds.length > 0
            ? supabase
                .from('session_beers')
                .select('id, session_id, beer_name, volume, quantity, abv, note, consumed_at, created_at')
                .in('session_id', sessionIds)
                .order('consumed_at', { ascending: true })
            : Promise.resolve({ data: [] as SessionBeer[], error: null }),
          sessionIds.length > 0
            ? supabase
                .from('session_comments')
                .select('id, session_id, user_id, body, created_at, updated_at')
                .in('session_id', sessionIds)
                .order('created_at', { ascending: true })
            : Promise.resolve({ data: [] as FeedComment[], error: null }),
        ]),
        FEED_REQUEST_TIMEOUT_MS,
        'Feed details are taking too long.'
      );

      if (!isLatestRequest()) return;

      if (cheersResult.error) {
        console.error('Cheers fetch error:', cheersResult.error);
      }
      if (beersResult.error) {
        console.error('Session beers fetch error:', beersResult.error);
      }
      if (commentsResult.error) {
        console.error('Session comments fetch error:', commentsResult.error);
      }

      const cheers: SessionCheer[] = (cheersResult.data || []) as SessionCheer[];
      const beerRows: SessionBeer[] = (beersResult.data || []) as SessionBeer[];
      const commentRows: FeedComment[] = (commentsResult.data || []) as FeedComment[];

      const profileIds = Array.from(new Set([
        ...sessionRows.map((session) => session.user_id),
        ...cheers.map((cheer) => cheer.user_id),
        ...commentRows.map((comment) => comment.user_id),
      ].filter(Boolean)));

      const profilesResult = profileIds.length > 0
        ? await withTimeout(
            supabase
              .from('profiles')
              .select('id, username, avatar_url')
              .in('id', profileIds),
            FEED_REQUEST_TIMEOUT_MS,
            'Feed profiles are taking too long.'
          )
        : { data: [] as any[], error: null };

      if (!isLatestRequest()) return;

      if (profilesResult.error) {
        console.error('Feed profiles fetch error:', profilesResult.error);
      }

      const profilesById = new Map<string, ProfilePreview>();
      for (const profile of (profilesResult.data || []) as any[]) {
        profilesById.set(profile.id, {
          id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url,
        });
      }

      const cheersBySession = cheers.reduce((acc, cheer) => {
        const existing = acc.get(cheer.session_id) || [];
        existing.push(cheer);
        acc.set(cheer.session_id, existing);
        return acc;
      }, new Map<string, SessionCheer[]>());

      const beersBySession = beerRows.reduce((acc, beer) => {
        if (!beer.session_id) return acc;
        const existing = acc.get(beer.session_id) || [];
        existing.push(beer);
        acc.set(beer.session_id, existing);
        return acc;
      }, new Map<string, SessionBeer[]>());

      const commentsBySession = commentRows.reduce((acc, comment) => {
        if (!comment.session_id) return acc;
        const existing = acc.get(comment.session_id) || [];
        existing.push({
          ...comment,
          profiles: profilesById.get(comment.user_id) || null,
        });
        acc.set(comment.session_id, existing);
        return acc;
      }, new Map<string, FeedComment[]>());

      const pageSessions = sessionRows.map((session): FeedItem => {
        const sessionCheers = cheersBySession.get(session.id) || [];
        const sessionComments = commentsBySession.get(session.id) || [];
        const sessionBeers = beersBySession.get(session.id) || (
          session.beer_name
            ? [{
                session_id: session.id,
                beer_name: session.beer_name,
                volume: session.volume,
                quantity: session.quantity,
                abv: session.abv ?? null,
                consumed_at: session.created_at,
              }]
            : []
        );

        return {
          type: 'session',
          id: session.id,
          publishedAt: session.published_at || session.created_at,
          session: {
            ...session,
            session_beers: sessionBeers,
            profiles: profilesById.get(session.user_id) || null,
            cheer_profiles: sessionCheers.map((cheer) => profilesById.get(cheer.user_id)).filter(Boolean) as ProfilePreview[],
            comments: sessionComments,
            comments_count: sessionComments.length,
            cheers_count: sessionCheers.length,
            has_cheered: user ? sessionCheers.some((cheer) => cheer.user_id === user.id) : false,
          }
        };
      });

      const pageCrawls = crawls.map((crawl): FeedItem => ({
        type: 'pub_crawl',
        id: crawl.id,
        publishedAt: crawl.publishedAt || crawl.createdAt || '',
        crawl: {
          ...crawl,
          has_cheered: user ? crawl.cheerProfiles.some(p => p.id === user.id) : false
        } as any, // cheating types slightly
      }));

      const merged = sortFeedItemsByPublishedAt([...pageSessions, ...pageCrawls]);

      setSessions((previous) => {
        // If not reset, we need to filter out duplicates if crawls overlap
        const existingIds = new Set(previous.map(p => p.id));
        const uniqueMerged = merged.filter(m => !existingIds.has(m.id));
        const nextSessions = reset ? merged : sortFeedItemsByPublishedAt([...previous, ...uniqueMerged]);
        sessionsRef.current = nextSessions;
        return nextSessions;
      });
    } catch (error: any) {
      const message = getErrorMessage(error, 'Could not load feed.');
      console.error('Feed fetch error:', message);
      if (isLatestRequest()) {
        setFetchError(message);
      }
    } finally {
      if (reset) {
        if (isLatestRequest()) {
          refreshingRef.current = false;
          setRefreshing(false);
        }
      } else {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }

      if (isLatestRequest()) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSessions({ reset: true });
    }, [fetchSessions])
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const previous = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = 'contain';
    return () => {
      document.body.style.overscrollBehaviorY = previous;
    };
  }, []);

  const handleScroll = (e: any) => {
    scrollOffsetY.current = e.nativeEvent.contentOffset.y;
  };

  const handleTouchStart = (e: any) => {
    if (Platform.OS !== 'web' || refreshing) return;
    if (scrollOffsetY.current > 0) {
      isPulling.current = false;
      return;
    }
    const touch = e.nativeEvent.touches?.[0];
    if (!touch) return;
    touchStartY.current = touch.pageY;
    isPulling.current = true;
  };

  const reachedThresholdRef = useRef(false);
  const handleTouchMove = (e: any) => {
    if (Platform.OS !== 'web' || !isPulling.current || refreshing) return;
    if (scrollOffsetY.current > 0) {
      isPulling.current = false;
      reachedThresholdRef.current = false;
      setPullDistance(0);
      return;
    }
    const touch = e.nativeEvent.touches?.[0];
    if (!touch) return;
    const delta = touch.pageY - touchStartY.current;
    if (delta > 0) {
      const next = Math.min(delta * 0.55, PULL_MAX_DISTANCE);
      if (next >= PULL_REFRESH_THRESHOLD && !reachedThresholdRef.current) {
        reachedThresholdRef.current = true;
        hapticLight();
      } else if (next < PULL_REFRESH_THRESHOLD) {
        reachedThresholdRef.current = false;
      }
      setPullDistance(next);
    } else {
      reachedThresholdRef.current = false;
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (Platform.OS !== 'web' || !isPulling.current) return;
    isPulling.current = false;
    reachedThresholdRef.current = false;
    if (pullDistance >= PULL_REFRESH_THRESHOLD && !refreshing) {
      setRefreshing(true);
      fetchSessions({ reset: true });
    }
    setPullDistance(0);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSessions({ reset: true });
  }, [fetchSessions]);

  const loadMoreSessions = useCallback(() => {
    fetchSessions({ reset: false });
  }, [fetchSessions]);

  const openProfile = useCallback((userId: string) => {
    if (userId === currentUserId) {
      navigation.navigate('Profile');
      return;
    }

    const parentNavigation = navigation.getParent?.();
    (parentNavigation || navigation).navigate('UserProfile', { userId });
  }, [currentUserId, navigation]);

  const editSession = useCallback((session: FeedSession) => {
    navigation.navigate('EditSession', { sessionId: session.id });
  }, [navigation]);

  const openPeople = useCallback(() => {
    navigation.navigate('People');
  }, [navigation]);

  const openComments = useCallback((session: FeedSession | PubCrawl) => {
    setCommentingSession(session);
    setCommentDraft('');
  }, []);

  const closeComments = useCallback(() => {
    setCommentingSession(null);
    setCommentDraft('');
    setSubmittingComment(false);
  }, []);

  const openCheers = useCallback((session: FeedSession | PubCrawl) => {
    setCheersSession(session);
  }, []);

  const closeCheers = useCallback(() => {
    setCheersSession(null);
  }, []);

  const submitComment = useCallback(async () => {
    const cleanComment = commentDraft.trim();
    if (!currentUserId || !commentingSession || !cleanComment || submittingComment) return;

    setSubmittingComment(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', currentUserId)
        .maybeSingle();

      if (profileError) {
        console.error('Comment profile fetch error:', profileError);
      }

      const currentProfile: ProfilePreview | null = profileData
        ? {
            id: profileData.id,
            username: profileData.username,
            avatar_url: profileData.avatar_url,
          }
        : null;

      if (isPubCrawlPost(commentingSession)) {
        const data = await addPubCrawlComment(commentingSession.id, cleanComment);
        const nextComment: PubCrawlComment = {
          id: data.id,
          crawlId: data.pub_crawl_id,
          userId: data.user_id,
          body: data.body,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          profile: currentProfile
            ? {
                id: currentProfile.id,
                username: currentProfile.username || null,
                avatarUrl: currentProfile.avatar_url || null,
              }
            : null,
        };

        setSessions((previous) => {
          const nextSessions = previous.map((feedItem) => {
            if (feedItem.type !== 'pub_crawl' || feedItem.id !== commentingSession.id) return feedItem;
            return {
              ...feedItem,
              crawl: {
                ...feedItem.crawl,
                comments: [...feedItem.crawl.comments, nextComment],
                commentsCount: feedItem.crawl.commentsCount + 1,
              },
            };
          });
          sessionsRef.current = nextSessions;
          return nextSessions;
        });

        setCommentingSession((current) => {
          if (!current || !isPubCrawlPost(current) || current.id !== commentingSession.id) return current;
          return {
            ...current,
            comments: [...current.comments, nextComment],
            commentsCount: current.commentsCount + 1,
          };
        });

        setCommentDraft('');
        hapticLight();

        if (commentingSession.userId !== currentUserId) {
          const { error: notifError } = await supabase.from('notifications').insert({
            user_id: commentingSession.userId,
            actor_id: currentUserId,
            type: 'comment',
            reference_id: commentingSession.id,
          });
          if (notifError) console.error('Comment notification insert error:', notifError);
        }
        return;
      }

      const { data, error } = await supabase
        .from('session_comments')
        .insert({
          session_id: commentingSession.id,
          user_id: currentUserId,
          body: cleanComment,
        })
        .select('id, session_id, user_id, body, created_at, updated_at')
        .single();

      if (error) throw error;

      const nextComment: FeedComment = {
        ...(data as Omit<FeedComment, 'profiles'>),
        profiles: currentProfile,
      };

      setSessions((previous) => {
        const nextSessions = previous.map((feedItem) => {
          if (feedItem.type !== 'session' || feedItem.id !== commentingSession.id) return feedItem;
          return {
            ...feedItem,
            session: {
              ...feedItem.session,
              comments: [...feedItem.session.comments, nextComment],
              comments_count: feedItem.session.comments_count + 1,
            }
          };
        });
        sessionsRef.current = nextSessions;
        return nextSessions;
      });

      setCommentingSession((current) => {
        if (!current || ('crawlId' in nextComment)) return current;
        if (current.id !== commentingSession.id) return current;
        return {
          ...current,
          comments: [...(current as FeedSession).comments, nextComment],
          comments_count: (current as FeedSession).comments_count + 1,
        } as FeedSession;
      });
      setCommentDraft('');
      hapticLight();

      if ('user_id' in commentingSession && commentingSession.user_id !== currentUserId) {
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: commentingSession.user_id,
          actor_id: currentUserId,
          type: 'comment',
          reference_id: commentingSession.id,
        });
        if (notifError) console.error('Comment notification insert error:', notifError);
      }
    } catch (error: any) {
      console.error('Submit comment error:', error);
      Alert.alert('Could not post comment', error?.message || 'Please try again.');
    } finally {
      setSubmittingComment(false);
    }
  }, [commentDraft, commentingSession, currentUserId, submittingComment]);

  const toggleCheers = useCallback(async (item: FeedSession) => {
    if (!currentUserId || item.user_id === currentUserId || cheeringSessionIdsRef.current.has(item.id)) {
      return;
    }

    const nextHasCheered = !item.has_cheered;
    const previousHasCheered = item.has_cheered;
    const previousCheersCount = item.cheers_count;
    const previousCheerProfiles = item.cheer_profiles;

    const pendingCheers = new Set(cheeringSessionIdsRef.current);
    pendingCheers.add(item.id);
    cheeringSessionIdsRef.current = pendingCheers;
    setCheeringSessionIds(pendingCheers);

    setSessions((previous) => {
      const nextSessions = previous.map((feedItem) => {
        if (feedItem.type !== 'session' || feedItem.id !== item.id) return feedItem;

        return {
          ...feedItem,
          session: {
            ...feedItem.session,
            has_cheered: nextHasCheered,
            cheers_count: Math.max(0, previousCheersCount + (nextHasCheered ? 1 : -1)),
            cheer_profiles: nextHasCheered
              ? feedItem.session.cheer_profiles
              : feedItem.session.cheer_profiles.filter((profile: any) => profile.id !== currentUserId),
          }
        };
      });
      sessionsRef.current = nextSessions;
      return nextSessions;
    });

    try {
      if (nextHasCheered) {
        const { error } = await supabase
          .from('session_cheers')
          .insert({
            session_id: item.id,
            user_id: currentUserId,
          });

        if (error && error.code !== '23505') throw error;

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', currentUserId)
          .maybeSingle();

        if (profileError) {
          console.error('Cheer profile fetch error:', profileError);
        } else if (profileData) {
          const cheerProfile: ProfilePreview = {
            id: profileData.id,
            username: profileData.username,
            avatar_url: profileData.avatar_url,
          };
          setSessions((previous) => {
            const nextSessions = previous.map((feedItem) => {
              if (feedItem.type !== 'session' || feedItem.id !== item.id) return feedItem;
              if (feedItem.session.cheer_profiles.some((profile: any) => profile.id === cheerProfile.id)) return feedItem;
              return {
                ...feedItem,
                session: {
                  ...feedItem.session,
                  cheer_profiles: [...feedItem.session.cheer_profiles, cheerProfile],
                }
              };
            });
            sessionsRef.current = nextSessions;
            return nextSessions;
          });
          setCheersSession((current) => {
            if (!current || !('cheer_profiles' in current)) return current;
            if (current.id !== item.id || current.cheer_profiles.some((profile: any) => profile.id === cheerProfile.id)) return current;
            return {
              ...current,
              cheer_profiles: [...current.cheer_profiles, cheerProfile],
            } as FeedSession;
          });
        }

        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: item.user_id,
          actor_id: currentUserId,
          type: 'cheer',
          reference_id: item.id,
        });
        if (notifError) console.error('Cheer notification insert error:', notifError);
      } else {
        const { error } = await supabase
          .from('session_cheers')
          .delete()
          .eq('session_id', item.id)
          .eq('user_id', currentUserId);

        if (error) throw error;

        await supabase.from('notifications')
          .delete()
          .eq('user_id', item.user_id)
          .eq('actor_id', currentUserId)
          .eq('type', 'cheer')
          .eq('reference_id', item.id);

        setCheersSession((current) => {
          if (!current || !('cheer_profiles' in current)) return current;
          if (current.id !== item.id) return current;
          return {
            ...current,
            cheer_profiles: current.cheer_profiles.filter((profile: any) => profile.id !== currentUserId),
          } as FeedSession;
        });
      }
    } catch (error: any) {
      setSessions((previous) => {
        const nextSessions = previous.map((feedItem) => {
          if (feedItem.type !== 'session' || feedItem.id !== item.id) return feedItem;
          return {
            ...feedItem,
            session: {
              ...feedItem.session,
              has_cheered: previousHasCheered,
              cheers_count: previousCheersCount,
              cheer_profiles: previousCheerProfiles,
            }
          };
        });
        sessionsRef.current = nextSessions;
        return nextSessions;
      });
      setCheersSession((current) => {
        if (!current || !('cheer_profiles' in current)) return current;
        if (current.id !== item.id) return current;
        return {
          ...current,
          cheer_profiles: previousCheerProfiles,
        } as FeedSession;
      });
      Alert.alert('Could not update cheers', error?.message || 'Please try again.');
    } finally {
      const nextPendingCheers = new Set(cheeringSessionIdsRef.current);
      nextPendingCheers.delete(item.id);
      cheeringSessionIdsRef.current = nextPendingCheers;
      setCheeringSessionIds(nextPendingCheers);
    }
  }, [currentUserId]);

  const deleteSession = useCallback((session: FeedSession) => {
    if (!currentUserId) return;

    hapticWarning();
    confirmDestructive('Delete Post', 'Remove this beer session from your feed?', 'Delete', async () => {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', session.id)
        .eq('user_id', currentUserId);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setSessions((previous) => {
        const nextSessions = previous.filter((feedSession) => feedSession.id !== session.id);
        sessionsRef.current = nextSessions;
        return nextSessions;
      });
      loadedSessionCountRef.current = Math.max(0, loadedSessionCountRef.current - 1);

      if (session.image_url) {
        deletePublicImageUrl('session_images', session.image_url);
      }
    });
  }, [currentUserId]);

  const renderFeedHeader = useCallback(() => {
    if (Platform.OS !== 'web' || (!pullDistance && !refreshing)) {
      return null;
    }

    return <PullIndicator pullDistance={pullDistance} refreshing={refreshing} />;
  }, [pullDistance, refreshing]);

  const renderEmptyFeed = useCallback(() => (
    <View style={styles.emptyState}>
      <EmptyIllustration kind="feed" size={170} />
      <Text style={styles.emptyTitle}>
        {followedUserCount === 0 ? 'Build your beer crew' : 'Quiet feed'}
      </Text>
      <Text style={styles.emptyText}>
        {followedUserCount === 0
          ? 'Follow friends to see their sessions here alongside your own.'
          : 'No one in your feed has posted a session yet.'}
      </Text>
      {followedUserCount === 0 ? (
        <TouchableOpacity style={styles.emptyButton} onPress={openPeople} activeOpacity={0.75}>
          <Text style={styles.emptyButtonText}>Find People</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ), [followedUserCount, openPeople]);

  const renderFeedFooter = useCallback(() => {
    if (!loadingMore) return null;

    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }, [loadingMore]);

  const toggleCrawlCheers = useCallback(async (crawl: PubCrawl) => {
    if (!currentUserId || crawl.userId === currentUserId || cheeringSessionIdsRef.current.has(crawl.id)) {
      return;
    }

    const pendingCheers = new Set(cheeringSessionIdsRef.current);
    pendingCheers.add(crawl.id);
    cheeringSessionIdsRef.current = pendingCheers;
    setCheeringSessionIds(pendingCheers);

    try {
      const isNowCheered = await togglePubCrawlCheers(crawl, currentUserId);
      let cheerProfile: { id: string; username: string | null; avatarUrl: string | null } = {
        id: currentUserId,
        username: null,
        avatarUrl: null,
      };

      if (isNowCheered) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', currentUserId)
          .maybeSingle();

        if (profileError) {
          console.error('Pub crawl cheer profile fetch error:', profileError);
        } else if (profileData) {
          cheerProfile = {
            id: profileData.id,
            username: profileData.username || null,
            avatarUrl: profileData.avatar_url || null,
          };
        }
      }

      setSessions((previous) => {
        const nextSessions = previous.map((feedItem) => {
          if (feedItem.type !== 'pub_crawl' || feedItem.id !== crawl.id) return feedItem;
          const alreadyCheered = feedItem.crawl.cheerProfiles.some((profile) => profile.id === currentUserId);
          const cheerProfiles = isNowCheered
            ? (
                alreadyCheered
                  ? feedItem.crawl.cheerProfiles
                  : [...feedItem.crawl.cheerProfiles, cheerProfile]
              )
            : feedItem.crawl.cheerProfiles.filter((profile) => profile.id !== currentUserId);

          return {
            ...feedItem,
            crawl: {
              ...feedItem.crawl,
              cheersCount: Math.max(0, feedItem.crawl.cheersCount + (isNowCheered ? (alreadyCheered ? 0 : 1) : (alreadyCheered ? -1 : 0))),
              cheerProfiles,
            }
          };
        });
        sessionsRef.current = nextSessions;
        return nextSessions;
      });

      setCheersSession((current) => {
        if (!current || !isPubCrawlPost(current) || current.id !== crawl.id) return current;
        const alreadyCheered = current.cheerProfiles.some((profile) => profile.id === currentUserId);
        return {
          ...current,
          cheersCount: Math.max(0, current.cheersCount + (isNowCheered ? (alreadyCheered ? 0 : 1) : (alreadyCheered ? -1 : 0))),
          cheerProfiles: isNowCheered
            ? (
                alreadyCheered
                  ? current.cheerProfiles
                  : [...current.cheerProfiles, cheerProfile]
              )
            : current.cheerProfiles.filter((profile) => profile.id !== currentUserId),
        };
      });
    } catch (e: any) {
      Alert.alert('Could not update cheers', e?.message || 'Please try again.');
    } finally {
      const nextPendingCheers = new Set(cheeringSessionIdsRef.current);
      nextPendingCheers.delete(crawl.id);
      cheeringSessionIdsRef.current = nextPendingCheers;
      setCheeringSessionIds(nextPendingCheers);
    }
  }, [currentUserId]);

  const renderSession = useCallback(({ item }: { item: FeedItem }) => {
    if (item.type === 'pub_crawl') {
      return (
        <PubCrawlFeedCard
          crawl={item.crawl}
          currentUserId={currentUserId}
          isCheering={cheeringSessionIds.has(item.id)}
          onToggleCheer={toggleCrawlCheers}
          onOpenComments={openComments}
          onOpenCheers={openCheers}
          onOpenProfile={openProfile}
          onImagePress={setViewingImageUrl}
        />
      );
    }

    return (
      <FeedSessionCard
        item={item.session}
        currentUserId={currentUserId}
        isCheering={cheeringSessionIds.has(item.id)}
        onDeleteSession={deleteSession}
        onEditSession={editSession}
        onOpenCheers={openCheers}
        onOpenComments={openComments as any}
        onOpenProfile={openProfile}
        onImagePress={setViewingImageUrl}
        onToggleCheers={toggleCheers}
      />
    );
  }, [cheeringSessionIds, currentUserId, deleteSession, editSession, openCheers, openComments, openProfile, toggleCheers, toggleCrawlCheers]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image source={beervaLogo} style={styles.logoImage} />
          <Text style={styles.logoText}>Beerva</Text>
        </View>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Bell color={colors.text} size={24} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {fetchError && !loading ? (
        <View style={styles.errorBanner}>
          <AlertTriangle color={colors.danger} size={18} />
          <Text style={styles.errorText} numberOfLines={2}>
            {sessions.length > 0 ? 'Couldn’t refresh feed.' : 'Couldn’t load feed.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setFetchError(null);
              setRefreshing(true);
              fetchSessions({ reset: true });
            }}
            activeOpacity={0.75}
          >
            <RefreshCw color={colors.background} size={14} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.scrollContent}>
          <SkeletonFeedCard />
          <SkeletonFeedCard />
          <SkeletonFeedCard />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          extraData={cheeringSessionIds}
          contentContainerStyle={[
            styles.scrollContent,
            sessions.length === 0 ? styles.emptyContent : null,
          ]}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          updateCellsBatchingPeriod={60}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentInsetAdjustmentBehavior="automatic"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          refreshControl={
            Platform.OS !== 'web'
              ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              : undefined
          }
          onEndReached={loadMoreSessions}
          onEndReachedThreshold={0.45}
          ListHeaderComponent={renderFeedHeader}
          ListEmptyComponent={renderEmptyFeed}
          ListFooterComponent={renderFeedFooter}
        />
      )}

      {unlockedTrophies.length > 0 && (
        <TrophyUnlockModal
          trophy={unlockedTrophies[0]}
          onClose={() => setUnlockedTrophies((prev) => prev.slice(1))}
        />
      )}

      <ImageViewerModal
        visible={Boolean(viewingImageUrl)}
        imageUrl={viewingImageUrl}
        onClose={() => setViewingImageUrl(null)}
      />

      {(() => {
        const normalizedCheers = cheersSession 
          ? ('cheerProfiles' in cheersSession 
              ? (cheersSession.cheerProfiles as any[]).map(p => ({ id: p.id, username: p.username, avatar_url: p.avatarUrl } as ProfilePreview)) 
              : cheersSession.cheer_profiles) 
          : [];
        return (
          <Modal
            visible={Boolean(cheersSession)}
            transparent
            animationType="fade"
            onRequestClose={closeCheers}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Cheers</Text>
                  <TouchableOpacity style={styles.modalCloseButton} onPress={closeCheers}>
                    <X color={colors.text} size={21} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={normalizedCheers as any}
                  keyExtractor={(item: any) => item.id}
                  style={styles.modalList}
                  contentContainerStyle={[
                    styles.modalListContent,
                    !normalizedCheers.length ? styles.modalEmptyContent : null,
                  ]}
                  renderItem={({ item }: { item: any }) => (
                    <TouchableOpacity
                      style={styles.personRow}
                      onPress={() => {
                        closeCheers();
                        openProfile(item.id);
                      }}
                      activeOpacity={0.75}
                    >
                      <CachedImage
                        uri={item.avatar_url}
                        fallbackUri={`https://i.pravatar.cc/150?u=${item.id}`}
                        style={styles.personAvatar}
                        recyclingKey={`cheer-${item.id}-${item.avatar_url || 'fallback'}`}
                        accessibilityLabel={`${item.username || 'Someone'}'s avatar`}
                      />
                      <View style={styles.personText}>
                        <Text style={styles.personName}>{item.username || 'Someone'}</Text>
                        <Text style={styles.personMeta}>Gave cheers</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.modalEmptyState}>
                      <Image source={beervaLogo} style={styles.modalEmptyLogo} />
                      <Text style={styles.modalEmptyText}>No cheers yet.</Text>
                    </View>
                  }
                />
              </View>
            </View>
          </Modal>
        );
      })()}

      {(() => {
        const normalizedComments = commentingSession 
          ? (isPubCrawlPost(commentingSession)
              ? (commentingSession.comments as any[]).map(c => ({ id: c.id, user_id: c.userId, body: c.body, created_at: c.createdAt, profiles: c.profile ? { id: c.profile.id, username: c.profile.username, avatar_url: c.profile.avatarUrl } : null } as FeedComment))
              : commentingSession.comments) 
          : [];
        return (
          <Modal
            visible={Boolean(commentingSession)}
            transparent
            animationType="fade"
            onRequestClose={closeComments}
          >
            <KeyboardAvoidingView
              style={styles.modalBackdrop}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Comments</Text>
                  <TouchableOpacity style={styles.modalCloseButton} onPress={closeComments}>
                    <X color={colors.text} size={21} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={normalizedComments as any}
                  keyExtractor={(item: any) => item.id}
                  style={styles.modalList}
                  contentContainerStyle={[
                    styles.modalListContent,
                    !normalizedComments.length ? styles.modalEmptyContent : null,
                  ]}
                  renderItem={({ item }: { item: any }) => (
                    <View style={styles.commentRow}>
                      <TouchableOpacity
                        onPress={() => {
                          closeComments();
                          openProfile(item.user_id);
                        }}
                        activeOpacity={0.75}
                      >
                        <CachedImage
                          uri={item.profiles?.avatar_url}
                          fallbackUri={`https://i.pravatar.cc/150?u=${item.user_id}`}
                          style={styles.commentAvatar}
                          recyclingKey={`comment-${item.id}-${item.profiles?.avatar_url || 'fallback'}`}
                          accessibilityLabel={`${item.profiles?.username || 'Someone'}'s avatar`}
                        />
                      </TouchableOpacity>
                      <View style={styles.commentBubble}>
                        <Text style={styles.commentBubbleName}>{item.profiles?.username || 'Someone'}</Text>
                        <Text style={styles.commentBubbleText}>{item.body}</Text>
                        <Text style={styles.commentTime}>{getTimeAgo(item.created_at)}</Text>
                      </View>
                    </View>
                  )}
                  ListEmptyComponent={
                    <View style={styles.modalEmptyState}>
                      <MessageCircle color={colors.textMuted} size={28} />
                      <Text style={styles.modalEmptyText}>No comments yet.</Text>
                    </View>
                  }
                />
                <View style={styles.commentComposer}>
              <TextInput
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
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}
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
    paddingBottom: Platform.OS === 'web' ? 16 : 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bellButton: {
    padding: 8,
    position: 'relative',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  badgeText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 3,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 44,
    height: 42,
    marginRight: 12,
    resizeMode: 'contain',
  },
  logoText: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 28,
    color: colors.primary,
  },
  scrollContent: {
    padding: Platform.OS === 'web' ? 14 : 16,
    paddingBottom: Platform.OS === 'web' ? 24 : 16,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 680 : undefined,
    alignSelf: 'center',
  },
  emptyContent: {
    flexGrow: 1,
  },
  pullIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 6,
  },
  pullText: {
    ...typography.bodyMuted,
    fontWeight: '700',
    color: colors.primary,
  },
  pullLogo: {
    width: 36,
    height: 34,
    resizeMode: 'contain',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  },
  ownerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  userName: {
    ...typography.h3,
    fontSize: 16,
  },
  timeText: {
    ...typography.caption,
    marginTop: 2,
  },
  imagePressable: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  imagePressed: {
    opacity: 0.94,
  },
  imageWrap: {
    position: 'relative',
    aspectRatio: 4 / 5,
    maxHeight: Platform.OS === 'web' ? 520 : undefined,
  },
  feedImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.cardMuted,
  },
  cheerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cheerOverlayLogo: {
    width: 110,
    height: 104,
    resizeMode: 'contain',
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
  cheersLogoSmall: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
  },
  cardContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: spacing.md,
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
  sessionSummary: {
    gap: 8,
  },
  summaryLocationText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    fontWeight: '800',
  },
  summaryDrinkText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    lineHeight: 22,
  },
  beerBreakdown: {
    paddingTop: 2,
    paddingLeft: 32,
    gap: 5,
  },
  beerBreakdownText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  editedText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  hangoverBadge: {
    alignSelf: 'flex-end',
    minWidth: 88,
    minHeight: 48,
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
  commentTop: {
    paddingHorizontal: spacing.lg,
    paddingTop: 2,
    paddingBottom: spacing.md,
  },
  commentText: {
    ...typography.body,
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.32)',
  },
  errorText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
    fontWeight: '600',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 64,
    gap: 10,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: 8,
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    ...shadows.raised,
  },
  modalHeader: {
    minHeight: 58,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  modalList: {
    maxHeight: Platform.OS === 'web' ? 420 : 460,
  },
  modalListContent: {
    padding: 16,
    gap: 12,
  },
  modalEmptyContent: {
    minHeight: 170,
    justifyContent: 'center',
  },
  modalEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  modalEmptyLogo: {
    width: 34,
    height: 32,
    resizeMode: 'contain',
    opacity: 0.72,
  },
  modalEmptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  personRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  personMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
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
});
