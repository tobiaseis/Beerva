import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Beer, Camera, CheckCircle2, Clock, Home, Images, LocateFixed, Lock, MapPin, MessageSquare, PlusCircle, Sparkles, Star, Trash2, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { AppButton } from '../components/AppButton';
import { AutocompleteInput } from '../components/AutocompleteInput';
import { BeerDraftForm } from '../components/BeerDraftForm';
import { ChugAttemptModal } from '../components/ChugAttemptModal';
import { ChugBottleButton } from '../components/ChugBottleButton';
import { DrinkingBuddiesPicker } from '../components/DrinkingBuddiesPicker';
import { MentionComposer } from '../components/MentionComposer';
import { PubRouletteModal } from '../components/PubRouletteModal';
import { Surface } from '../components/Surface';
import { confirmDestructive, showAlert } from '../lib/dialogs';
import { hapticError, hapticMedium, hapticSuccess, hapticWarning } from '../lib/haptics';
import {
  deletePublicImageUrl,
  prepareWebImageFromPickerAsset,
  SelectedImage,
  UPLOAD_IMAGE_MAX_WIDTH,
  uploadImageToBucket,
} from '../lib/imageUpload';
import {
  buildSessionPhotoRecords,
  MAX_SESSION_PHOTOS,
  SessionPhoto,
  sortSessionPhotos,
} from '../lib/sessionPhotos';
import {
  beerDraftToPayload,
  createEmptyBeerDraft,
  getBeerLine,
  getLegacySessionBeerFields,
  getTotalBeerQuantity,
  SessionBeer,
} from '../lib/sessionBeers';
import {
  CHUG_CONTAINER_TYPE,
  CHUG_REQUIRED_VOLUME,
  CHUG_VIDEO_MAX_SECONDS,
} from '../lib/chugAttempts';
import { analyzeChugVideo } from '../lib/chugMediaPipe';
import { chugVideoFromPickerAsset, SelectedChugVideo, uploadChugProofVideo } from '../lib/chugProofStorage';
import {
  createUserPub,
  fetchAndCacheNearbyPubs,
  formatPubDetail,
  formatPubLabel,
  incrementPubUseCount,
  labelsMatchPub,
  PlaceCategory,
  PubRecord,
  searchCachedPubs,
  UserLocation,
} from '../lib/pubDirectory';
import { getRouletteNoPubsMessage, prepareRoulettePubs } from '../lib/pubRoulette';
import {
  ActivePubCrawlState,
  cancelPubCrawl,
  convertActiveSessionToPubCrawl,
  fetchActivePubCrawl,
  finishCrawlStopAndStartNext,
  publishPubCrawl,
  updateCurrentCrawlStopPub,
} from '../lib/pubCrawlsApi';
import { supabase } from '../lib/supabase';
import { getCurrentTimezone } from '../lib/timezone';
import { fetchProfileStats } from '../lib/profileStatsApi';
import { didUnlockAllTrophies, getTrophies } from '../lib/profileStats';
import { useFocused } from '../lib/useFocused';
import { useBeverageCatalog } from '../lib/beverageCatalogContext';
import { getCurrentDeviceLocation, getPreviouslyGrantedDeviceLocation } from '../lib/deviceLocation';
import { MentionCandidate } from '../lib/mentions';
import { notifyContentMentionsSafely } from '../lib/mentionNotifications';
import { colors } from '../theme/colors';
import { floatingTabBarMetrics, radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

const beervaLogo = require('../../assets/beerva-header-logo.png');

type ActiveSession = {
  id: string;
  user_id: string;
  pub_id: string | null;
  pub_name: string;
  status: 'active';
  comment: string | null;
  image_url: string | null;
  started_at: string;
  timezone?: string | null;
  pub_crawl_id?: string | null;
  crawl_stop_order?: number | null;
  is_crawl_stop?: boolean | null;
  hide_from_feed?: boolean | null;
};

type SessionImageDraft = SelectedImage & {
  persistedUrl?: string | null;
};

type FollowOutRow = {
  following_id: string;
};

type FollowInRow = {
  follower_id: string;
};

type MutualFollowerProfile = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

type ChugAnalysisPreview = {
  durationMs: number;
  confidenceScore?: number | null;
  detectedStartMs?: number | null;
  detectedEndMs?: number | null;
};

const PUB_SEARCH_MIN_LENGTH = 3;
const NEARBY_CACHE_MIN_RESULTS = 8;
const COMMENT_AUTOSAVE_DELAY_MS = 750;

const getStartedLabel = (dateString?: string | null) => {
  if (!dateString) return 'Started recently';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Started recently';
  return `Started ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const createLegacyPlaceholder = () => ({
  beer_name: 'Session in progress',
  volume: 'Pint',
  quantity: 1,
  abv: 0,
});

const getLocationCacheKey = (location: UserLocation) => (
  `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`
);

const getPubRecordKey = (pubRecord: PubRecord) => (
  pubRecord.id
  || `${pubRecord.source || 'pub'}:${pubRecord.source_id || `${pubRecord.name}-${pubRecord.city || ''}`}`.toLowerCase()
);

const mergePubRecords = (...groups: PubRecord[][]) => {
  const merged = new Map<string, PubRecord>();
  groups.flat().forEach((pubRecord) => {
    merged.set(getPubRecordKey(pubRecord), pubRecord);
  });
  return Array.from(merged.values());
};

const uniquePhotoUrls = (urls: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  return urls.filter((url): url is string => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

export const RecordScreen = ({ navigation }: any) => {
  const { catalog } = useBeverageCatalog();
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [activeCrawl, setActiveCrawl] = useState<ActivePubCrawlState | null>(null);
  const [sessionBeers, setSessionBeers] = useState<SessionBeer[]>([]);
  const [beerDraft, setBeerDraft] = useState(createEmptyBeerDraft);

  const [pub, setPub] = useState('');
  const [pubOptions, setPubOptions] = useState<PubRecord[]>([]);
  const [selectedPub, setSelectedPub] = useState<PubRecord | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [comment, setComment] = useState('');
  const [postMentions, setPostMentions] = useState<MentionCandidate[]>([]);
  const commentFocus = useFocused();

  const [selectedImages, setSelectedImages] = useState<SessionImageDraft[]>([]);
  const [keeperIndex, setKeeperIndex] = useState(0);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [photoChoiceVisible, setPhotoChoiceVisible] = useState(false);
  const [pubCategoryChoiceVisible, setPubCategoryChoiceVisible] = useState(false);
  const [chugVisible, setChugVisible] = useState(false);
  const [chugBusy, setChugBusy] = useState(false);
  const [chugAnalyzing, setChugAnalyzing] = useState(false);
  const [chugNeedsManualTiming, setChugNeedsManualTiming] = useState(false);
  const [chugError, setChugError] = useState<string | null>(null);
  const [chugSelectedBeerId, setChugSelectedBeerId] = useState<string | null>(null);
  const [chugSelectedVerifierId, setChugSelectedVerifierId] = useState<string | null>(null);
  const [chugAnalysisPreview, setChugAnalysisPreview] = useState<ChugAnalysisPreview | null>(null);
  const [chugVideo, setChugVideo] = useState<SelectedChugVideo | null>(null);
  const [mutualFollowers, setMutualFollowers] = useState<MutualFollowerProfile[]>([]);

  const [loadingActive, setLoadingActive] = useState(true);
  const [starting, setStarting] = useState(false);
  const [addingBeer, setAddingBeer] = useState(false);
  const [ending, setEnding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pubSearching, setPubSearching] = useState(false);
  const [pubSearchError, setPubSearchError] = useState<string | null>(null);
  const [locatingPubs, setLocatingPubs] = useState(false);
  const [addingPub, setAddingPub] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [convertingCrawl, setConvertingCrawl] = useState(false);
  const [crawlBusy, setCrawlBusy] = useState(false);
  const [crawlPubAction, setCrawlPubAction] = useState<'change' | 'next' | null>(null);
  const [crawlPubDraft, setCrawlPubDraft] = useState('');
  const [photoWarningAction, setPhotoWarningAction] = useState<'next' | 'end' | null>(null);
  const [rouletteVisible, setRouletteVisible] = useState(false);
  const [rouletteLoading, setRouletteLoading] = useState(false);
  const [rouletteError, setRouletteError] = useState<string | null>(null);
  const [roulettePubs, setRoulettePubs] = useState<PubRecord[]>([]);

  const pubSearchCache = useRef<Map<string, PubRecord[]>>(new Map());
  const pubSearchAbort = useRef<AbortController | null>(null);
  const remotePubSearchCache = useRef<Set<string>>(new Set());
  const nearbySeedKeys = useRef<Set<string>>(new Set());
  const rouletteRequestId = useRef(0);
  const passiveLocationAttempted = useRef(false);
  const passiveSeedAttempted = useRef(false);
  const photoWarningBypassAction = useRef<'next' | 'end' | null>(null);
  const lastSavedComment = useRef<{ sessionId: string | null; comment: string }>({
    sessionId: null,
    comment: '',
  });
  const persistedPhotoUrls = useRef<string[]>([]);

  useEffect(() => {
    if (passiveSeedAttempted.current) return;
    passiveSeedAttempted.current = true;

    let cancelled = false;
    (async () => {
      const cachedLocation = await getPreviouslyGrantedDeviceLocation();
      if (cancelled || !cachedLocation) return;

      passiveLocationAttempted.current = true;
      setUserLocation((current) => current || cachedLocation);

      const cacheKey = getLocationCacheKey(cachedLocation);
      if (nearbySeedKeys.current.has(cacheKey)) return;

      try {
        const { lookupError } = await fetchAndCacheNearbyPubs(cachedLocation, '');
        if (cancelled) return;
        nearbySeedKeys.current.add(cacheKey);
        pubSearchCache.current.clear();
        if (lookupError) {
          console.warn('Pre-warm pub cache lookup error:', lookupError);
        }
      } catch (err) {
        console.warn('Pre-warm pub cache failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const isCrawlAction = activeCrawl && crawlPubAction;
    const currentSearchText = isCrawlAction ? crawlPubDraft : pub;
    const cleanPub = currentSearchText.trim();

    if ((activeSession && !isCrawlAction) || (cleanPub.length < 2 && !userLocation)) {
      setPubOptions([]);
      setPubSearching(false);
      setPubSearchError(null);
      return;
    }

    const locationKey = userLocation ? getLocationCacheKey(userLocation) : 'no-location';
    const cacheKey = `${cleanPub.toLowerCase()}|${locationKey}`;
    const cachedOptions = pubSearchCache.current.get(cacheKey);
    if (cachedOptions) {
      setPubOptions(cachedOptions);
      setPubSearching(false);
      setPubSearchError(null);
      return;
    }

    let cancelled = false;
    setPubSearching(true);
    setPubSearchError(null);

    const delayDebounceFn = setTimeout(async () => {
      let remoteError: string | null = null;
      try {
        const results = await searchCachedPubs(
          cleanPub,
          userLocation,
          cleanPub.length >= PUB_SEARCH_MIN_LENGTH ? 20 : 12
        );

        let nextResults = results;
        let searchLocation = userLocation;

        if (!searchLocation && cleanPub.length >= PUB_SEARCH_MIN_LENGTH && !passiveLocationAttempted.current) {
          passiveLocationAttempted.current = true;
          try {
            searchLocation = await getPreviouslyGrantedDeviceLocation()
              || await getCurrentDeviceLocation();
            if (searchLocation && !cancelled) {
              setUserLocation(searchLocation);
            }
          } catch (locationErr) {
            console.warn('Could not get location for pub search:', locationErr);
          }
        }

        if (searchLocation && cleanPub.length >= PUB_SEARCH_MIN_LENGTH && results.length < 6) {
          const remoteKey = `${cleanPub.toLowerCase()}|${getLocationCacheKey(searchLocation)}`;
          if (!remotePubSearchCache.current.has(remoteKey)) {
            try {
              const remote = await fetchAndCacheNearbyPubs(searchLocation, cleanPub);
              remotePubSearchCache.current.add(remoteKey);
              nextResults = mergePubRecords(remote.pubs, results);
              pubSearchCache.current.clear();
              console.log('[Beerva] Pub search remote response:', {
                query: cleanPub,
                location: searchLocation,
                lookupError: remote.lookupError,
                diagnostics: remote.diagnostics,
                merged_count: nextResults.length,
              });
              if (remote.lookupError && nextResults.length === 0) {
                remoteError = remote.lookupError;
              }
            } catch (err: any) {
              remoteError = err?.message || 'Remote pub search unavailable.';
              console.warn('Remote pub search unavailable:', err);
            }
          }
        } else if (cleanPub.length >= PUB_SEARCH_MIN_LENGTH && !searchLocation) {
          console.log('[Beerva] Pub search skipped remote: no location available.');
        }

        if (cancelled) return;
        pubSearchCache.current.set(cacheKey, nextResults);
        setPubOptions(nextResults);
        setPubSearchError(nextResults.length === 0 && remoteError ? remoteError : null);
      } catch (e: any) {
        if (!cancelled) {
          console.error('Pub search error:', e);
          setPubSearchError(e?.message || 'Pub search failed.');
        }
      } finally {
        if (!cancelled) setPubSearching(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(delayDebounceFn);
    };
  }, [activeSession, pub, userLocation, activeCrawl, crawlPubAction, crawlPubDraft]);

  const resetActiveState = useCallback(() => {
    setActiveSession(null);
    setActiveCrawl(null);
    setSessionBeers([]);
    setBeerDraft(createEmptyBeerDraft());
    setComment('');
    setPostMentions([]);
    setSelectedImages([]);
    setKeeperIndex(0);
    setExistingImageUrl(null);
    setSavingPhoto(false);
    setChugVisible(false);
    setChugBusy(false);
    setChugAnalyzing(false);
    setChugNeedsManualTiming(false);
    setChugError(null);
    setChugSelectedBeerId(null);
    setChugSelectedVerifierId(null);
    setChugAnalysisPreview(null);
    setChugVideo(null);
    setMutualFollowers([]);
    setSelectedPub(null);
    setCrawlPubAction(null);
    setCrawlPubDraft('');
    setPhotoWarningAction(null);
    photoWarningBypassAction.current = null;
    lastSavedComment.current = { sessionId: null, comment: '' };
    persistedPhotoUrls.current = [];
  }, []);

  const fetchSessionBeers = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase
      .from('session_beers')
      .select('id, session_id, beer_name, volume, quantity, abv, beverage_category, note, consumed_at, created_at')
      .eq('session_id', sessionId)
      .order('consumed_at', { ascending: true });

    if (error) throw error;
    setSessionBeers((data || []) as SessionBeer[]);
  }, []);

  const fetchActiveSessionPhotos = useCallback(async (session: ActiveSession) => {
    const { data, error } = await supabase
      .from('session_photos')
      .select('id, session_id, image_url, is_keeper, expires_at, created_at')
      .eq('session_id', session.id);

    if (error) throw error;

    const savedPhotos = sortSessionPhotos((data || []) as SessionPhoto[]);
    const photoUrls = savedPhotos.length > 0
      ? savedPhotos.map((photo) => photo.image_url)
      : uniquePhotoUrls([session.image_url]);
    const photoDrafts = photoUrls.slice(0, MAX_SESSION_PHOTOS).map((imageUrl) => ({
      uri: imageUrl,
      persistedUrl: imageUrl,
      mimeType: 'image/jpeg',
    }));

    persistedPhotoUrls.current = uniquePhotoUrls(photoDrafts.map((image) => image.persistedUrl));
    setSelectedImages(photoDrafts);
    setKeeperIndex(0);
    setExistingImageUrl(photoDrafts[0]?.persistedUrl || session.image_url || null);
  }, []);

  const fetchActiveSession = useCallback(async () => {
    try {
      setLoadingActive(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        resetActiveState();
        return;
      }

      const { data, error } = await supabase
        .from('sessions')
        .select('id, user_id, pub_id, pub_name, status, comment, image_url, started_at, timezone, pub_crawl_id, crawl_stop_order, is_crawl_stop, hide_from_feed')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      const session = (data || [])[0] as ActiveSession | undefined;
      if (!session) {
        resetActiveState();
        return;
      }

      setActiveSession(session);
      setPub('');
      setSelectedPub(null);
      setComment(session.comment || '');
      setPostMentions([]);
      lastSavedComment.current = {
        sessionId: session.id,
        comment: (session.comment || '').trim(),
      };
      setSavingPhoto(false);
      await fetchActiveSessionPhotos(session);
      await fetchSessionBeers(session.id);
      if (session.pub_crawl_id) {
        setActiveCrawl(await fetchActivePubCrawl());
      } else {
        setActiveCrawl(null);
      }
    } catch (error: any) {
      console.error('Active session fetch error:', error);
      showAlert('Could not load session', error?.message || 'Please try again.');
    } finally {
      setLoadingActive(false);
    }
  }, [fetchActiveSessionPhotos, fetchSessionBeers, resetActiveState]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveSession();
    }, [fetchActiveSession])
  );

  const saveActiveSessionComment = useCallback(async (nextComment: string) => {
    if (!activeSession) return;

    const sessionId = activeSession.id;
    const draftComment = nextComment.trim();
    if (
      lastSavedComment.current.sessionId === sessionId
      && lastSavedComment.current.comment === draftComment
    ) {
      return;
    }

    const { error } = await supabase
      .from('sessions')
      .update({ comment: draftComment || null })
      .eq('id', sessionId)
      .eq('user_id', activeSession.user_id)
      .eq('status', 'active');

    if (error) {
      console.warn('Could not autosave session comment:', error.message);
      return;
    }

    lastSavedComment.current = { sessionId, comment: draftComment };
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession || loadingActive) return;

    const sessionId = activeSession.id;
    const draftComment = comment.trim();
    if (
      lastSavedComment.current.sessionId === sessionId
      && lastSavedComment.current.comment === draftComment
    ) {
      return;
    }

    const timeout = setTimeout(async () => {
      await saveActiveSessionComment(draftComment);
    }, COMMENT_AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [activeSession, comment, loadingActive, saveActiveSessionComment]);

  const ensureProfile = async (user: any) => {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfile) return;

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: user.user_metadata?.username || user.email?.split('@')[0] || 'beer_lover',
      avatar_url: user.user_metadata?.avatar_url || 'https://i.pravatar.cc/150?u=' + user.id,
      timezone: getCurrentTimezone(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) throw error;
  };

  const notifyMatesSessionStarted = async (sessionId: string, userId: string, pubName: string) => {
    try {
      const [followingResult, followersResult] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', userId),
        supabase.from('follows').select('follower_id').eq('following_id', userId),
      ]);

      if (followingResult.error) throw followingResult.error;
      if (followersResult.error) throw followersResult.error;

      const followers = new Set(((followersResult.data || []) as FollowInRow[]).map((row) => row.follower_id));
      const mutualIds = ((followingResult.data || []) as FollowOutRow[])
        .map((row) => row.following_id)
        .filter((id) => followers.has(id));

      if (mutualIds.length === 0) return;

      const { error } = await supabase.from('notifications').insert(
        mutualIds.map((mateId) => ({
          user_id: mateId,
          actor_id: userId,
          type: 'session_started',
          reference_id: sessionId,
          metadata: { pub_name: pubName },
        }))
      );

      if (error) {
        console.error('Session started notification insert error:', error);
      }
    } catch (error) {
      console.error('Session started notification error:', error);
    }
  };

  const notifyMatesPubCrawlStarted = async (crawlId: string, pubName: string) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) return;

      const [followingResult, followersResult] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id),
        supabase.from('follows').select('follower_id').eq('following_id', user.id),
      ]);

      if (followingResult.error) throw followingResult.error;
      if (followersResult.error) throw followersResult.error;

      const followers = new Set(((followersResult.data || []) as FollowInRow[]).map((row) => row.follower_id));
      const mutualIds = ((followingResult.data || []) as FollowOutRow[])
        .map((row) => row.following_id)
        .filter((id) => followers.has(id));

      if (mutualIds.length === 0) return;

      const { error } = await supabase.from('notifications').insert(
        mutualIds.map((mateId) => ({
          user_id: mateId,
          actor_id: user.id,
          type: 'pub_crawl_started',
          reference_id: crawlId,
          metadata: { pub_name: pubName },
        }))
      );

      if (error) throw error;
    } catch (error) {
      console.warn('Could not send pub crawl started notifications', error);
    }
  };

  const seedNearbyPubs = useCallback(async (location: UserLocation, signal?: AbortSignal) => {
    const cacheKey = getLocationCacheKey(location);
    const query = pub.trim();
    let cachedPubs: PubRecord[] = [];

    try {
      cachedPubs = await searchCachedPubs(query, location, 24);
    } catch (error) {
      console.warn('Cached nearby pub search failed:', error);
    }

    if (signal?.aborted) return { pubs: [] as PubRecord[], lookupError: null, diagnostics: null };

    if (nearbySeedKeys.current.has(cacheKey)) {
      return { pubs: cachedPubs, lookupError: null, diagnostics: null };
    }

    const hasUsefulCachedResults = query
      ? cachedPubs.length >= NEARBY_CACHE_MIN_RESULTS
      : cachedPubs.length > 0;

    if (hasUsefulCachedResults) {
      nearbySeedKeys.current.add(cacheKey);
      return { pubs: cachedPubs, lookupError: null, diagnostics: null };
    }

    let remote;
    try {
      remote = await fetchAndCacheNearbyPubs(location, query);
    } catch (error: any) {
      if (cachedPubs.length > 0) {
        console.warn('Live nearby pub refresh failed; using cached pubs:', error?.message || error);
        return { pubs: cachedPubs, lookupError: null, diagnostics: null };
      }

      throw error;
    }

    if (signal?.aborted) return { pubs: [] as PubRecord[], lookupError: null, diagnostics: null };
    nearbySeedKeys.current.add(cacheKey);
    pubSearchCache.current.clear();
    const mergedPubs = mergePubRecords(remote.pubs, cachedPubs);

    return {
      ...remote,
      pubs: mergedPubs,
      lookupError: mergedPubs.length > 0 ? null : remote.lookupError,
    };
  }, [pub]);

  const useNearbyPubs = async () => {
    if (locatingPubs) return;

    setLocatingPubs(true);
    pubSearchAbort.current?.abort();
    const abortController = new AbortController();
    pubSearchAbort.current = abortController;

    try {
      const location = await getCurrentDeviceLocation();
      setUserLocation(location);
      const { pubs: nearbyPubs, lookupError } = await seedNearbyPubs(location, abortController.signal);
      if (abortController.signal.aborted) return;
      setPubOptions(nearbyPubs);
      setPubSearchError(nearbyPubs.length === 0 && lookupError ? lookupError : null);
      hapticSuccess();

      if (nearbyPubs.length === 0 && !lookupError) {
        showAlert('No pubs nearby yet', 'Type the pub name and Beerva will add it.');
      } else if (lookupError) {
        showAlert('Pub data partial', lookupError);
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        hapticError();
        showAlert('Nearby search unavailable', error?.message || 'Type the pub name and Beerva will add it.');
      }
    } finally {
      setLocatingPubs(false);
    }
  };

  const selectPubRecord = (pubRecord: PubRecord) => {
    setSelectedPub(pubRecord);
    setPub(formatPubLabel(pubRecord));
  };

  const selectPubLabel = (label: string) => {
    const matchingPub = pubOptions.find((option) => labelsMatchPub(label, option));
    if (matchingPub) {
      selectPubRecord(matchingPub);
    } else {
      setSelectedPub(null);
    }
  };

  const loadRoulettePubs = useCallback(async () => {
    const requestId = rouletteRequestId.current + 1;
    rouletteRequestId.current = requestId;

    setRouletteLoading(true);
    setRouletteError(null);

    try {
      const location = userLocation || await getCurrentDeviceLocation();
      if (rouletteRequestId.current !== requestId) return;
      setUserLocation(location);

      let cachedPubs: PubRecord[] = [];
      try {
        cachedPubs = await searchCachedPubs('', location, 36);
      } catch (error) {
        console.warn('Roulette cached pub search failed:', error);
      }

      if (rouletteRequestId.current !== requestId) return;
      const cachedNearbyPubs = prepareRoulettePubs(cachedPubs);
      if (cachedNearbyPubs.length > 0) {
        setRoulettePubs(cachedNearbyPubs);
        setPubOptions((previous) => mergePubRecords(cachedNearbyPubs, previous));
        setRouletteError(null);
      }

      let remotePubs: PubRecord[] = [];
      try {
        const remote = await fetchAndCacheNearbyPubs(location, '');
        remotePubs = remote.pubs;
        nearbySeedKeys.current.add(getLocationCacheKey(location));
        pubSearchCache.current.clear();
      } catch (error: any) {
        console.warn('Roulette live pub lookup failed:', error);
      }

      if (rouletteRequestId.current !== requestId) return;

      const nearbyPubs = prepareRoulettePubs(mergePubRecords(remotePubs, cachedPubs));
      setRoulettePubs(nearbyPubs);
      setPubOptions((previous) => mergePubRecords(nearbyPubs, previous));

      if (nearbyPubs.length === 0) {
        setRouletteError(getRouletteNoPubsMessage());
        hapticWarning();
      } else {
        hapticSuccess();
      }
    } catch (error: any) {
      if (rouletteRequestId.current !== requestId) return;
      hapticError();
      setRoulettePubs([]);
      setRouletteError(error?.message || 'Could not open Beer Roulette.');
    } finally {
      if (rouletteRequestId.current === requestId) {
        setRouletteLoading(false);
      }
    }
  }, [userLocation]);

  const openPubRoulette = () => {
    setRouletteVisible(true);
    hapticMedium();
    loadRoulettePubs();
  };

  const closePubRoulette = () => {
    rouletteRequestId.current += 1;
    setRouletteVisible(false);
    setRouletteLoading(false);
  };

  const useRoulettePub = (pubRecord: PubRecord) => {
    selectPubRecord(pubRecord);
    setRouletteVisible(false);
    hapticSuccess();
  };

  const openPubCategoryChoice = () => {
    if (pub.trim().length < 2 || addingPub) return;
    setPubCategoryChoiceVisible(true);
    hapticMedium();
  };

  const addTypedPub = async (placeCategory: PlaceCategory = 'pub') => {
    const cleanPub = pub.trim();
    if (cleanPub.length < 2 || addingPub) return;

    setPubCategoryChoiceVisible(false);
    setAddingPub(true);
    try {
      const pubRecord = await createUserPub(cleanPub, userLocation, placeCategory);
      setPubOptions((previous) => [
        pubRecord,
        ...previous.filter((item) => item.id !== pubRecord.id),
      ]);
      selectPubRecord(pubRecord);
      hapticSuccess();
    } catch (error: any) {
      hapticError();
      showAlert('Could not add pub', error?.message || 'Please try again.');
    } finally {
      setAddingPub(false);
    }
  };

  const startSessionForPub = async (pubRecord: PubRecord | null, fallbackPubName: string) => {
    if (starting) return;

    const trimmedPub = fallbackPubName.trim();
    if (!pubRecord && !trimmedPub) {
      showAlert('Missing pub', 'Choose where you are drinking before starting the session.');
      return;
    }

    setStarting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

      await ensureProfile(user);

      const resolvedPubRecord = pubRecord || await createUserPub(trimmedPub, userLocation);
      const sessionPubName = resolvedPubRecord ? formatPubLabel(resolvedPubRecord) : trimmedPub;
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          pub_id: resolvedPubRecord?.id || null,
          pub_name: sessionPubName,
          status: 'active',
          started_at: now,
          timezone: getCurrentTimezone(),
          comment: null,
          image_url: null,
          ...createLegacyPlaceholder(),
        })
        .select('id, user_id, pub_id, pub_name, status, comment, image_url, started_at, timezone')
        .single();

      if (error) throw error;

      const session = data as ActiveSession;
      setActiveSession(session);
      setActiveCrawl(null);
      setSessionBeers([]);
      setComment('');
      setPostMentions([]);
      lastSavedComment.current = { sessionId: session.id, comment: '' };
      setSelectedImages([]);
      setKeeperIndex(0);
      setExistingImageUrl(null);
      setSavingPhoto(false);
      persistedPhotoUrls.current = [];
      setPub('');
      setSelectedPub(null);
      hapticSuccess();
      notifyMatesSessionStarted(session.id, user.id, session.pub_name);
      showAlert('Session started', 'Your mates have been notified. Add drinks as you go.');
    } catch (error: any) {
      console.error('Start session error:', error);
      if (error?.code === '23505') {
        await fetchActiveSession();
        showAlert('Session already active', 'You already have a drinking session running.');
      } else {
        hapticError();
        showAlert('Could not start session', error?.message || 'Please try again.');
      }
    } finally {
      setStarting(false);
    }
  };

  const turnIntoPubCrawl = async () => {
    if (!activeSession || convertingCrawl) return;
    
    setConvertingCrawl(true);
    try {
      const crawlState = await convertActiveSessionToPubCrawl(activeSession.id, {
        session: activeSession,
        beers: sessionBeers,
      });
      setActiveCrawl(crawlState);
      hapticSuccess();
      showAlert('Pub Crawl Started', 'Your session is now a pub crawl.');
      notifyMatesPubCrawlStarted(crawlState.crawl.id, crawlState.activeStop?.pubName || activeSession.pub_name);
    } catch (error: any) {
      console.error('Convert to pub crawl error:', error);
      hapticError();
      showAlert('Could not start pub crawl', error?.message || 'Please try again.');
    } finally {
      setConvertingCrawl(false);
    }
  };

  const startSession = async () => {
    const trimmedPub = pub.trim();
    if (!trimmedPub) {
      showAlert('Missing pub', 'Choose where you are drinking before starting the session.');
      return;
    }

    const matchingPub = selectedPub || pubOptions.find((option) => labelsMatchPub(trimmedPub, option)) || null;
    await startSessionForPub(matchingPub, trimmedPub);
  };

  const startRouletteSession = async (pubRecord: PubRecord) => {
    selectPubRecord(pubRecord);
    setRouletteVisible(false);
    await startSessionForPub(pubRecord, formatPubLabel(pubRecord));
  };

  const syncLegacyFields = async (sessionId: string, beers: SessionBeer[]) => {
    const legacyFields = beers.length > 0 ? getLegacySessionBeerFields(beers) : createLegacyPlaceholder();
    const { error } = await supabase
      .from('sessions')
      .update(legacyFields)
      .eq('id', sessionId);

    if (error) {
      console.warn('Could not sync legacy session fields:', error.message);
    }
  };

  const chugSelectedBeer = sessionBeers.find((beer) => beer.id === chugSelectedBeerId) || null;

  const addBeerToSession = async (draftOverride?: typeof beerDraft): Promise<SessionBeer | null> => {
    if (!activeSession) return null;
    const draftToAdd = draftOverride || beerDraft;
    if (!draftToAdd.beerName.trim()) {
      showAlert('Missing drink', 'Add what you are drinking.');
      return null;
    }

    setAddingBeer(true);
    try {
      const payload = {
        session_id: activeSession.id,
        ...beerDraftToPayload(draftToAdd, catalog),
        consumed_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('session_beers')
        .insert(payload)
        .select('id, session_id, beer_name, volume, quantity, abv, beverage_category, note, consumed_at, created_at')
        .single();

      if (error) throw error;

      const nextBeers = [...sessionBeers, data as SessionBeer];
      setSessionBeers(nextBeers);
      setBeerDraft(createEmptyBeerDraft());
      syncLegacyFields(activeSession.id, nextBeers);
      hapticSuccess();
      return data as SessionBeer;
    } catch (error: any) {
      console.error('Add beer error:', error);
      hapticError();
      showAlert('Could not add drink', error?.message || 'Please try again.');
      return null;
    } finally {
      setAddingBeer(false);
    }
  };

  const incrementBeerInSession = async (beer: SessionBeer) => {
    if (!activeSession || !beer.id) return;

    const nextQuantity = (beer.quantity || 1) + 1;
    const nextBeers = sessionBeers.map((item) => (
      item.id === beer.id ? { ...item, quantity: nextQuantity } : item
    ));

    setSessionBeers(nextBeers);

    const { data, error } = await supabase
      .from('session_beers')
      .update({ quantity: nextQuantity })
      .eq('id', beer.id)
      .eq('session_id', activeSession.id)
      .select('id, session_id, beer_name, volume, quantity, abv, beverage_category, note, consumed_at, created_at')
      .single();

    if (error) {
      setSessionBeers(sessionBeers);
      hapticError();
      showAlert('Could not add one more', error.message);
      return;
    }

    const persistedBeers = sessionBeers.map((item) => (
      item.id === beer.id ? data as SessionBeer : item
    ));
    setSessionBeers(persistedBeers);
    syncLegacyFields(activeSession.id, persistedBeers);
    hapticSuccess();
  };

  const removeBeerFromSession = async (beer: SessionBeer) => {
    if (!activeSession || !beer.id) return;

    hapticWarning();
    const nextBeers = sessionBeers.filter((item) => item.id !== beer.id);
    setSessionBeers(nextBeers);

    const { error } = await supabase
      .from('session_beers')
      .delete()
      .eq('id', beer.id)
      .eq('session_id', activeSession.id);

    if (error) {
      setSessionBeers(sessionBeers);
      showAlert('Could not remove beer', error.message);
      return;
    }

    syncLegacyFields(activeSession.id, nextBeers);
  };

  const loadMutualFollowers = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const [followingResult, followersResult] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
    ]);

    if (followingResult.error) throw followingResult.error;
    if (followersResult.error) throw followersResult.error;

    const followers = new Set(((followersResult.data || []) as FollowInRow[]).map((row) => row.follower_id));
    const mutualIds = ((followingResult.data || []) as FollowOutRow[])
      .map((row) => row.following_id)
      .filter((id) => followers.has(id));

    if (mutualIds.length === 0) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', mutualIds)
      .order('username', { ascending: true });

    if (error) throw error;
    return (data || []) as MutualFollowerProfile[];
  };

  const openChugFlow = async () => {
    if (!activeSession) return;

    setChugVisible(true);
    setChugError(null);
    setChugAnalysisPreview(null);
    setChugNeedsManualTiming(false);
    setChugAnalyzing(false);
    setChugVideo(null);
    setChugSelectedBeerId(null);
    setChugSelectedVerifierId(null);

    try {
      const followers = await loadMutualFollowers();
      setMutualFollowers(followers);
    } catch (error: any) {
      setChugError(error?.message || 'Could not load mutual followers.');
    }
  };

  const createChugBeer = async (beerName: string) => {
    if (chugBusy) return;
    setChugBusy(true);

    try {
      const createdBeer = await addBeerToSession({
        beerName,
        volume: CHUG_REQUIRED_VOLUME,
        quantity: 1,
      });
      if (createdBeer?.id) {
        setChugSelectedBeerId(createdBeer.id);
        setChugError(null);
      }
    } finally {
      setChugBusy(false);
    }
  };

  const recordChugVideo = async () => {
    if (!activeSession || !chugSelectedBeerId || !chugSelectedVerifierId || chugBusy) return;

    setChugBusy(true);
    setChugError(null);
    setChugAnalysisPreview(null);
    setChugNeedsManualTiming(false);
    setChugVideo(null);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setChugError('Camera access is needed to record a chug attempt.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 0.65,
        videoMaxDuration: CHUG_VIDEO_MAX_SECONDS,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Low,
        cameraType: ImagePicker.CameraType.back,
      });

      if (result.canceled || !result.assets[0]) return;

      const preparedVideo = await chugVideoFromPickerAsset(result.assets[0]);
      setChugVideo(preparedVideo);
      setChugAnalyzing(true);

      try {
        const analysis = await analyzeChugVideo(preparedVideo);

        if (!analysis.ok || !analysis.durationMs) {
          setChugNeedsManualTiming(true);
          setChugError(analysis.reason || 'Could not detect a clean chug start and stop.');
          return;
        }

        setChugAnalysisPreview({
          durationMs: analysis.durationMs,
          confidenceScore: analysis.confidenceScore,
          detectedStartMs: analysis.detectedStartMs,
          detectedEndMs: analysis.detectedEndMs,
        });
      } catch (analysisError: any) {
        setChugNeedsManualTiming(true);
        setChugError(analysisError?.message || 'Could not analyze this chug attempt.');
      } finally {
        setChugAnalyzing(false);
      }
    } catch (error: any) {
      setChugError(error?.message || 'Could not analyze this chug attempt.');
    } finally {
      setChugBusy(false);
    }
  };

  const saveChugAttempt = async (timingSource: 'ai' | 'pending_manual') => {
    const durationMs = timingSource === 'ai' ? chugAnalysisPreview?.durationMs ?? null : null;
    if (
      !activeSession
      || !chugSelectedBeerId
      || !chugSelectedVerifierId
      || !chugVideo
      || (timingSource === 'ai' && !chugAnalysisPreview)
      || chugBusy
    ) {
      return;
    }

    setChugBusy(true);
    setChugError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      const videoPath = await uploadChugProofVideo(chugVideo, user.id);
      const { data: attempt, error } = await supabase
        .from('session_chug_attempts')
        .insert({
          session_id: activeSession.id,
          session_beer_id: chugSelectedBeerId,
          user_id: user.id,
          verifier_user_id: chugSelectedVerifierId,
          status: 'unverified',
          duration_ms: durationMs,
          ai_duration_ms: durationMs,
          timing_source: timingSource,
          confidence_score: chugAnalysisPreview?.confidenceScore ?? null,
          detected_start_ms: chugAnalysisPreview?.detectedStartMs ?? null,
          detected_end_ms: chugAnalysisPreview?.detectedEndMs ?? null,
          container_type: CHUG_CONTAINER_TYPE,
          required_volume: CHUG_REQUIRED_VOLUME,
          video_path: videoPath,
        })
        .select('id')
        .single();

      if (error) throw error;

      const selectedBeer = sessionBeers.find((beer) => beer.id === chugSelectedBeerId);
      const { error: notifError } = await supabase.from('notifications').insert({
        user_id: chugSelectedVerifierId,
        actor_id: user.id,
        type: 'chug_verification',
        reference_id: attempt.id,
        metadata: {
          target_type: 'chug_attempt',
          session_id: activeSession.id,
          beer_name: selectedBeer?.beer_name || null,
          duration_ms: durationMs,
          pub_name: activeSession.pub_name,
        },
      });

      if (notifError) console.error('Chug verification notification insert error:', notifError);

      setChugVisible(false);
      setChugAnalysisPreview(null);
      setChugNeedsManualTiming(false);
      setChugVideo(null);
      hapticSuccess();
      showAlert(
        'Chug saved',
        timingSource === 'pending_manual'
          ? 'Your mate will set the time while reviewing the video.'
          : 'Your result is on the post as unverified until your mate reviews it.'
      );
    } catch (error: any) {
      setChugError(error?.message || 'Could not save chug attempt.');
    } finally {
      setChugBusy(false);
    }
  };

  const acceptChugAttempt = () => saveChugAttempt('ai');
  const sendChugForManualTiming = () => saveChugAttempt('pending_manual');

  const prepareSessionImageAsset = async (asset: ImagePicker.ImagePickerAsset): Promise<SessionImageDraft> => {
    if (Platform.OS === 'web') {
      return prepareWebImageFromPickerAsset(asset);
    }

    const ImageManipulator = await import('expo-image-manipulator');
    const manipResult = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: UPLOAD_IMAGE_MAX_WIDTH } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    return {
      uri: manipResult.uri,
      mimeType: 'image/jpeg',
    };
  };

  const saveSelectedSessionPhotos = async (
    sessionId: string,
    userId: string,
    images: SessionImageDraft[] = selectedImages,
    imageKeeperIndex = keeperIndex
  ) => {
    const limitedImages = images.slice(0, MAX_SESSION_PHOTOS);
    const uploadedUrls: string[] = [];
    const savedImages: SessionImageDraft[] = [];

    try {
      for (const image of limitedImages) {
        const persistedUrl = image.persistedUrl || await uploadImageToBucket('session_images', image, `users/${userId}/sessions`);
        if (!image.persistedUrl) uploadedUrls.push(persistedUrl);

        savedImages.push({
          ...image,
          persistedUrl,
          uri: image.uri || persistedUrl,
        });
      }

      const photoUrls = uniquePhotoUrls(savedImages.map((image) => image.persistedUrl));
      const photoRecords = buildSessionPhotoRecords(sessionId, photoUrls, imageKeeperIndex);
      const previousUrls = persistedPhotoUrls.current;
      const nextUrlSet = new Set(photoUrls);
      const removedUrls = previousUrls.filter((url) => !nextUrlSet.has(url));

      const { error: deleteError } = await supabase
        .from('session_photos')
        .delete()
        .eq('session_id', sessionId);
      if (deleteError) throw deleteError;

      if (photoRecords.length > 0) {
        const { error: photoError } = await supabase
          .from('session_photos')
          .insert(photoRecords);
        if (photoError) throw photoError;
      }

      const keeper = photoRecords.find((record) => record.is_keeper);
      persistedPhotoUrls.current = photoUrls;
      removedUrls.forEach((url) => deletePublicImageUrl('session_images', url));

      return {
        keeperImageUrl: keeper?.image_url || null,
        uploadedUrls,
        savedImages,
      };
    } catch (error) {
      uploadedUrls.forEach((url) => deletePublicImageUrl('session_images', url));
      throw error;
    }
  };

  const persistActiveSessionPhotos = async (
    nextImages: SessionImageDraft[],
    nextKeeperIndex = Math.min(keeperIndex, Math.max(nextImages.length - 1, 0))
  ) => {
    if (!activeSession) return;

    setSavingPhoto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

      const savedPhotos = await saveSelectedSessionPhotos(activeSession.id, user.id, nextImages, nextKeeperIndex);
      const { error } = await supabase
        .from('sessions')
        .update({ image_url: savedPhotos.keeperImageUrl })
        .eq('id', activeSession.id)
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (error) throw error;

      const safeKeeperIndex = savedPhotos.savedImages.length > 0
        ? Math.min(nextKeeperIndex, savedPhotos.savedImages.length - 1)
        : 0;
      setSelectedImages(savedPhotos.savedImages);
      setKeeperIndex(safeKeeperIndex);
      setExistingImageUrl(savedPhotos.keeperImageUrl);
      setActiveSession((current) => (
        current?.id === activeSession.id
          ? { ...current, image_url: savedPhotos.keeperImageUrl }
          : current
      ));
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleImageAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const availableSlots = MAX_SESSION_PHOTOS - selectedImages.length;
    if (availableSlots <= 0) {
      showAlert('Photo limit reached', `A session can have up to ${MAX_SESSION_PHOTOS} photos.`);
      return;
    }

    const preparedImages = await Promise.all(
      assets.slice(0, availableSlots).map(prepareSessionImageAsset)
    );

    if (preparedImages.length === 0) return;

    const nextImages = [...selectedImages, ...preparedImages].slice(0, MAX_SESSION_PHOTOS);
    const nextKeeperIndex = Math.min(keeperIndex, Math.max(nextImages.length - 1, 0));
    setSelectedImages(nextImages);
    setKeeperIndex(nextKeeperIndex);
    photoWarningBypassAction.current = null;

    await persistActiveSessionPhotos(nextImages);
  };

  const chooseFromLibrary = async () => {
    setPhotoChoiceVisible(false);
    const availableSlots = MAX_SESSION_PHOTOS - selectedImages.length;
    if (availableSlots <= 0) {
      showAlert('Photo limit reached', `Remove a photo before adding another one.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: availableSlots === 1,
      allowsMultipleSelection: availableSlots > 1,
      orderedSelection: true,
      selectionLimit: availableSlots,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets?.length) {
      try {
        await handleImageAssets(result.assets);
      } catch (error: any) {
        showAlert('Could not add photo', error?.message || 'Please try again.');
      }
    }
  };

  const takePhoto = async () => {
    setPhotoChoiceVisible(false);
    if (selectedImages.length >= MAX_SESSION_PHOTOS) {
      showAlert('Photo limit reached', `Remove a photo before adding another one.`);
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert('Camera access needed', 'Allow camera access to take a new session photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
      cameraType: ImagePicker.CameraType.back,
    });

    if (!result.canceled && result.assets[0]) {
      try {
        await handleImageAssets([result.assets[0]]);
      } catch (error: any) {
        showAlert('Could not add photo', error?.message || 'Please try again.');
      }
    }
  };

  const chooseKeeperImage = async (index: number) => {
    setKeeperIndex(index);
    try {
      await persistActiveSessionPhotos(selectedImages, index);
    } catch (error: any) {
      showAlert('Could not update keeper photo', error?.message || 'Please try again.');
      await fetchActiveSession();
    }
  };

  const removeSelectedImage = async (index: number) => {
    const nextImages = selectedImages.filter((_, imageIndex) => imageIndex !== index);
    let nextKeeperIndex = 0;
    if (nextImages.length > 0) {
      if (index === keeperIndex) {
        nextKeeperIndex = Math.min(index, nextImages.length - 1);
      } else if (index < keeperIndex) {
        nextKeeperIndex = keeperIndex - 1;
      } else {
        nextKeeperIndex = Math.min(keeperIndex, nextImages.length - 1);
      }
    }

    setSelectedImages(nextImages);
    setKeeperIndex(nextKeeperIndex);

    try {
      await persistActiveSessionPhotos(nextImages, nextKeeperIndex);
    } catch (error: any) {
      showAlert('Could not remove photo', error?.message || 'Please try again.');
      await fetchActiveSession();
    }
  };

  const handleChangeCurrentCrawlPub = async () => {
    if (!activeCrawl || !activeSession) return;
    const cleanDraft = crawlPubDraft.trim();
    if (cleanDraft.length < 2) return;
    
    setCrawlBusy(true);
    try {
      const pubRecord = selectedPub || pubOptions.find(o => labelsMatchPub(cleanDraft, o)) || null;
      await updateCurrentCrawlStopPub(activeCrawl.crawl.id, pubRecord, cleanDraft);
      setCrawlPubAction(null);
      await fetchActiveSession();
      hapticSuccess();
    } catch (e: any) {
      hapticError();
      showAlert('Could not change pub', e?.message);
    } finally {
      setCrawlBusy(false);
    }
  };

  const handleNextCrawlStop = async () => {
    if (!activeCrawl || !activeSession) return;
    if (sessionBeers.length === 0) {
      showAlert('Add a drink first', 'The current stop needs at least one drink before moving on.');
      return;
    }
    if (!existingImageUrl && selectedImages.length === 0 && photoWarningBypassAction.current !== 'next') {
      setPhotoWarningAction('next');
      return;
    }
    
    if (crawlPubAction !== 'next') {
      setCrawlPubAction('next');
      setPhotoWarningAction(null);
      return;
    }

    const cleanDraft = crawlPubDraft.trim();
    if (cleanDraft.length < 2) return;

    setCrawlBusy(true);
    try {
      if (selectedImages.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in!');

        const savedPhotos = await saveSelectedSessionPhotos(activeSession.id, user.id);

        const { error } = await supabase
          .from('sessions')
          .update({ image_url: savedPhotos.keeperImageUrl })
          .eq('id', activeSession.id);
        if (error) throw error;
      }

      await saveActiveSessionComment(comment);

      const pubRecord = selectedPub || pubOptions.find(o => labelsMatchPub(cleanDraft, o)) || null;
      const { finishedStop } = await finishCrawlStopAndStartNext(activeCrawl.crawl.id, pubRecord, cleanDraft);

      if (finishedStop?.id) {
        notifyContentMentionsSafely({
          targetType: activeCrawl ? 'pub_crawl' : 'session',
          targetId: activeCrawl.crawl.id,
          surface: 'post',
          sourceId: finishedStop.id,
          text: comment.trim(),
          mentions: postMentions,
        });
      }
      setPostMentions([]);
      
      setCrawlPubAction(null);
      setCrawlPubDraft('');
      setSelectedPub(null);
      setPhotoWarningAction(null);
      photoWarningBypassAction.current = null;
      await fetchActiveSession();
      hapticSuccess();
    } catch (e: any) {
      hapticError();
      showAlert('Could not start next stop', e?.message);
    } finally {
      setCrawlBusy(false);
    }
  };

  const handleEndPubCrawl = async () => {
    if (!activeCrawl || !activeSession) return;
    if (sessionBeers.length === 0) {
      showAlert('Add a drink first', 'The current stop needs at least one drink before ending the crawl.');
      return;
    }
    if (!existingImageUrl && selectedImages.length === 0 && photoWarningBypassAction.current !== 'end') {
      setPhotoWarningAction('end');
      return;
    }

    setCrawlBusy(true);
    try {
      if (selectedImages.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in!');

        const savedPhotos = await saveSelectedSessionPhotos(activeSession.id, user.id);

        const { error } = await supabase
          .from('sessions')
          .update({ image_url: savedPhotos.keeperImageUrl })
          .eq('id', activeSession.id);
        if (error) throw error;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const oldStats = user ? await fetchProfileStats(user.id) : null;
      const oldTrophies = oldStats ? getTrophies(oldStats) : [];

      await saveActiveSessionComment(comment);
      await publishPubCrawl(activeCrawl.crawl.id);
      notifyContentMentionsSafely({
        targetType: activeCrawl ? 'pub_crawl' : 'session',
        targetId: activeCrawl.crawl.id,
        surface: 'post',
        sourceId: activeSession.id,
        text: comment.trim(),
        mentions: postMentions,
      });
      setPostMentions([]);

      const newStats = user ? await fetchProfileStats(user.id) : null;
      const newTrophies = newStats ? getTrophies(newStats) : [];
      const newlyUnlockedTrophies = newTrophies.filter((nt) =>
        nt.earned && !oldTrophies.find((ot) => ot.id === nt.id && ot.earned)
      );
      const allTrophiesUnlocked = didUnlockAllTrophies(oldTrophies, newTrophies);

      resetActiveState();
      setPub('');
      hapticSuccess();
      showAlert('Crawl Finished', 'Your pub crawl has been posted to the feed.');
      navigation.navigate('Feed', { newlyUnlockedTrophies, allTrophiesUnlocked });
    } catch (e: any) {
      hapticError();
      showAlert('Could not end crawl', e?.message);
    } finally {
      setCrawlBusy(false);
    }
  };

  const handleCancelCrawl = () => {
    if (!activeCrawl || cancelling) return;
    
    hapticWarning();
    confirmDestructive('Cancel Pub Crawl', 'Discard this entire pub crawl and all its stops?', 'Cancel Crawl', async () => {
      setCancelling(true);
      try {
        await cancelPubCrawl(activeCrawl.crawl.id);
        if (existingImageUrl) {
          deletePublicImageUrl('session_images', existingImageUrl);
        }
        resetActiveState();
      } catch (error: any) {
        showAlert('Could not cancel crawl', error?.message || 'Please try again.');
      } finally {
        setCancelling(false);
      }
    });
  };

  const endSession = async () => {
    if (!activeSession) return;
    if (sessionBeers.length === 0) {
      showAlert('Add a drink first', 'A session needs at least one drink before it can be posted.');
      return;
    }

    setEnding(true);
    let keeperImageUrl = existingImageUrl;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

      if (selectedImages.length > 0) {
        const savedPhotos = await saveSelectedSessionPhotos(activeSession.id, user.id);
        keeperImageUrl = savedPhotos.keeperImageUrl;
      }

      const oldStats = await fetchProfileStats(user.id);
      const oldTrophies = getTrophies(oldStats);

      const now = new Date().toISOString();
      const imageUrl = keeperImageUrl;
      const { error } = await supabase
        .from('sessions')
        .update({
          status: 'published',
          ended_at: now,
          published_at: now,
          timezone: getCurrentTimezone(),
          comment: comment.trim() || null,
          image_url: imageUrl,
          ...getLegacySessionBeerFields(sessionBeers),
        })
        .eq('id', activeSession.id)
        .eq('user_id', user.id);

      if (error) throw error;

      notifyContentMentionsSafely({
        targetType: activeCrawl ? 'pub_crawl' : 'session',
        targetId: activeCrawl?.crawl.id || activeSession.id,
        surface: 'post',
        sourceId: activeSession.id,
        text: comment.trim(),
        mentions: postMentions,
      });
      setPostMentions([]);

      incrementPubUseCount(activeSession.pub_id);

      const newStats = await fetchProfileStats(user.id);
      const newTrophies = getTrophies(newStats);
      const newlyUnlockedTrophies = newTrophies.filter((nt) =>
        nt.earned && !oldTrophies.find((ot) => ot.id === nt.id && ot.earned)
      );
      const allTrophiesUnlocked = didUnlockAllTrophies(oldTrophies, newTrophies);

      resetActiveState();
      setPub('');
      hapticSuccess();
      showAlert('Posted', 'Your drinking session is now on the feed.');
      navigation.navigate('Feed', { newlyUnlockedTrophies, allTrophiesUnlocked });
    } catch (error: any) {
      console.error('End session error:', error);
      hapticError();
      showAlert('Could not end session', error?.message || 'Please try again.');
    } finally {
      setEnding(false);
    }
  };

  const cancelSession = () => {
    if (!activeSession || cancelling) return;

    hapticWarning();
    confirmDestructive('Cancel Session', 'Discard this active drinking session?', 'Cancel Session', async () => {
      setCancelling(true);
      try {
        const { error } = await supabase
          .from('sessions')
          .update({ status: 'cancelled', ended_at: new Date().toISOString() })
          .eq('id', activeSession.id)
          .eq('status', 'active');

        if (error) throw error;

        if (existingImageUrl) {
          deletePublicImageUrl('session_images', existingImageUrl);
        }

        resetActiveState();
      } catch (error: any) {
        showAlert('Could not cancel session', error?.message || 'Please try again.');
      } finally {
        setCancelling(false);
      }
    });
  };

  const previewImageUri = selectedImages.length > 0 ? selectedImages[keeperIndex]?.uri : existingImageUrl;
  const selectedPhotoCountLabel = `${selectedImages.length}/${MAX_SESSION_PHOTOS}`;
  const cleanPub = pub.trim();
  const pubOptionLabels = pubOptions.map(formatPubLabel);
  const hasExactPubOption = cleanPub.length >= 2 && pubOptions.some((option) => labelsMatchPub(cleanPub, option));
  const nearbyQuickPubs = !cleanPub && userLocation ? pubOptions.slice(0, 4) : [];
  const selectedPubDetail = selectedPub ? formatPubDetail(selectedPub) : '';
  const addPubFooter = cleanPub.length >= 2 && !selectedPub && !hasExactPubOption ? (
    <TouchableOpacity
      style={styles.addPubFooter}
      onPress={openPubCategoryChoice}
      disabled={addingPub}
      activeOpacity={0.76}
    >
      <View style={styles.addPubIcon}>
        <PlusCircle color={colors.primary} size={19} />
      </View>
      <View style={styles.addPubText}>
        <Text style={styles.addPubTitle} numberOfLines={1}>
          {addingPub ? 'Adding pub...' : `Add "${cleanPub}"`}
        </Text>
        <Text style={styles.addPubHint}>New Beerva pub</Text>
      </View>
    </TouchableOpacity>
  ) : null;

  if (loadingActive) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="always"
      nestedScrollEnabled
    >
      <View style={styles.header}>
        <Text style={typography.h2}>{activeSession ? 'Drinking Session' : 'Start Session'}</Text>
      </View>

      <View style={styles.content}>
        {!activeSession ? (
          <Surface style={styles.formSurface}>
            <View style={styles.introRow}>
              <Text style={styles.introTitle}>Where are you drinking?</Text>
              <TouchableOpacity
                style={[styles.nearbyButton, locatingPubs ? styles.nearbyButtonActive : null]}
                onPress={useNearbyPubs}
                disabled={locatingPubs}
                activeOpacity={0.76}
              >
                {locatingPubs ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <LocateFixed color={colors.primary} size={17} />
                )}
                <Text style={styles.nearbyButtonText}>{locatingPubs ? 'Looking' : 'Nearby'}</Text>
              </TouchableOpacity>
            </View>
            <AutocompleteInput
              value={pub}
              onChangeText={(text) => {
                setPub(text);
                setSelectedPub(null);
              }}
              onSelectItem={selectPubLabel}
              data={pubOptionLabels}
              placeholder="Search pub"
              icon={<MapPin color={colors.textMuted} size={20} />}
              footer={addPubFooter}
            />
            {nearbyQuickPubs.length > 0 ? (
              <View style={styles.quickPubList}>
                {nearbyQuickPubs.map((pubRecord) => (
                  <TouchableOpacity
                    key={pubRecord.id}
                    style={styles.quickPubChip}
                    onPress={() => selectPubRecord(pubRecord)}
                    activeOpacity={0.76}
                  >
                    <Text style={styles.quickPubText} numberOfLines={1}>{formatPubLabel(pubRecord)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {selectedPub ? (
              <View style={styles.selectedPubBox}>
                <CheckCircle2 color={colors.success} size={18} />
                <View style={styles.selectedPubText}>
                  <Text style={styles.selectedPubName} numberOfLines={1}>{formatPubLabel(selectedPub)}</Text>
                  {selectedPubDetail ? (
                    <Text style={styles.selectedPubDetail} numberOfLines={1}>{selectedPubDetail}</Text>
                  ) : null}
                </View>
              </View>
            ) : pubSearching ? (
              <Text style={styles.pubSearchHint}>Searching pubs...</Text>
            ) : pubSearchError ? (
              <Text style={styles.pubSearchError} numberOfLines={3}>{pubSearchError}</Text>
            ) : (cleanPub.length >= 2 && pubOptions.length === 0 && !userLocation && !hasExactPubOption) ? (
              <Text style={styles.pubSearchHint}>No match found. Tap "Nearby" for location-based discovery, or add the pub below.</Text>
            ) : null}
            <AppButton label="Start Session" onPress={startSession} loading={starting} />
            <TouchableOpacity
              style={[styles.rouletteCta, rouletteLoading || starting ? styles.rouletteCtaDisabled : null]}
              onPress={openPubRoulette}
              disabled={rouletteLoading || starting}
              activeOpacity={0.78}
            >
              <View style={styles.rouletteCtaColorRail}>
                <View style={[styles.rouletteCtaRailSegment, styles.rouletteCtaRailRed]} />
                <View style={[styles.rouletteCtaRailSegment, styles.rouletteCtaRailGold]} />
                <View style={[styles.rouletteCtaRailSegment, styles.rouletteCtaRailBlue]} />
                <View style={[styles.rouletteCtaRailSegment, styles.rouletteCtaRailGreen]} />
                <View style={[styles.rouletteCtaRailSegment, styles.rouletteCtaRailPurple]} />
              </View>
              <View style={styles.rouletteCtaIcon}>
                {rouletteLoading ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Sparkles color={colors.primary} size={22} />
                )}
              </View>
              <View style={styles.rouletteCtaText}>
                <Text style={styles.rouletteCtaKicker}>Beer Roulette</Text>
                <Text style={styles.rouletteCtaTitle}>Don't know where to beer?</Text>
                <Text style={styles.rouletteCtaSubtitle}>Let the wheel decide</Text>
              </View>
              <View style={styles.rouletteCtaJackpot}>
                <Text style={styles.rouletteCtaJackpotText}>777</Text>
              </View>
            </TouchableOpacity>
          </Surface>
        ) : (
          <>
            <Surface style={styles.lockedPubSurface}>
              <View style={styles.lockedPubHeader}>
                <View style={styles.lockedPubIcon}>
                  <Lock color={colors.primary} size={20} />
                </View>
                <View style={styles.lockedPubText}>
                  <Text style={styles.lockedPubLabel}>
                    {activeCrawl ? `Stop ${activeCrawl.activeStop?.stopOrder || 1}` : 'Drinking at'}
                  </Text>
                  <Text style={styles.lockedPubName}>{activeSession.pub_name}</Text>
                </View>
                {!activeCrawl ? (
                  <TouchableOpacity
                    style={[
                      styles.crawlConvertButton,
                      convertingCrawl ? styles.crawlConvertButtonDisabled : null,
                    ]}
                    onPress={turnIntoPubCrawl}
                    disabled={convertingCrawl}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityLabel="Turn into pub crawl"
                  >
                    {convertingCrawl ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <Sparkles color={colors.primary} size={22} />
                    )}
                    <Text style={styles.crawlConvertKicker}>Turn into</Text>
                    <Text style={styles.crawlConvertLabel}>Pub Crawl</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              
              {activeCrawl && crawlPubAction === 'change' ? (
                <View style={styles.crawlPubEditContainer}>
                  <Text style={styles.sectionLabel}>Change Current Pub</Text>
                  <AutocompleteInput
                    value={crawlPubDraft}
                    onChangeText={setCrawlPubDraft}
                    onSelectItem={(label) => {
                      const p = pubOptions.find(o => labelsMatchPub(label, o));
                      if (p) setSelectedPub(p);
                      setCrawlPubDraft(label);
                    }}
                    data={pubOptions.map(formatPubLabel)}
                    placeholder="Search pub"
                    icon={<MapPin color={colors.textMuted} size={20} />}
                  />
                  <View style={styles.crawlPubEditActions}>
                    <TouchableOpacity onPress={() => setCrawlPubAction(null)} style={styles.cancelButton}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <View style={styles.endButtonWrap}>
                      <AppButton label="Save" onPress={handleChangeCurrentCrawlPub} loading={crawlBusy} />
                    </View>
                  </View>
                </View>
              ) : activeCrawl && !crawlPubAction ? (
                <TouchableOpacity onPress={() => { setCrawlPubAction('change'); setCrawlPubDraft(activeSession.pub_name); }} style={styles.changePubButton}>
                  <Text style={styles.changePubText}>Change Pub</Text>
                </TouchableOpacity>
              ) : null}

              {!activeCrawl || !crawlPubAction ? (
                <View style={styles.startedRow}>
                  <Clock color={colors.textMuted} size={15} />
                  <Text style={styles.startedText}>{getStartedLabel(activeSession.started_at)}</Text>
                </View>
              ) : null}
            </Surface>

            {activeCrawl && crawlPubAction === 'next' ? (
              <Surface style={styles.formSurface}>
                <Text style={styles.sectionTitle}>Where to next?</Text>
                <AutocompleteInput
                  value={crawlPubDraft}
                  onChangeText={setCrawlPubDraft}
                  onSelectItem={(label) => {
                    const p = pubOptions.find(o => labelsMatchPub(label, o));
                    if (p) setSelectedPub(p);
                    setCrawlPubDraft(label);
                  }}
                  data={pubOptions.map(formatPubLabel)}
                  placeholder="Search next pub"
                  icon={<MapPin color={colors.textMuted} size={20} />}
                />
                <View style={styles.crawlPubEditActions}>
                  <TouchableOpacity onPress={() => { photoWarningBypassAction.current = null; setCrawlPubAction(null); }} style={styles.cancelButton}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <View style={styles.endButtonWrap}>
                    <AppButton label="Start Next Stop" onPress={handleNextCrawlStop} loading={crawlBusy} />
                  </View>
                </View>
              </Surface>
            ) : null}

            <Surface style={styles.formSurface}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Drinks</Text>
                <Text style={styles.sectionMeta}>{getTotalBeerQuantity(sessionBeers)}</Text>
              </View>

              {sessionBeers.length === 0 ? (
                <View style={styles.emptyBeerList}>
                  <Beer color={colors.textMuted} size={24} />
                  <Text style={styles.emptyBeerText}>No drinks added yet.</Text>
                </View>
              ) : (
                <View style={styles.beerList}>
                  {sessionBeers.map((beer) => (
                    <View key={beer.id || `${beer.beer_name}-${beer.consumed_at}`} style={styles.beerRow}>
                      <Image source={beervaLogo} style={styles.beerRowLogo} />
                      <View style={styles.beerRowText}>
                        <Text style={styles.beerRowTitle}>{beer.beer_name}</Text>
                        <Text style={styles.beerRowMeta}>{getBeerLine(beer)}</Text>
                      </View>
                      <View style={styles.beerRowActions}>
                        <TouchableOpacity
                          style={styles.incrementBeerButton}
                          onPress={() => incrementBeerInSession(beer)}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Add one more ${beer.beer_name}`}
                        >
                          <PlusCircle color={colors.primary} size={17} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removeBeerButton}
                          onPress={() => removeBeerFromSession(beer)}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${beer.beer_name}`}
                        >
                          <Trash2 color={colors.danger} size={17} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <BeerDraftForm
                draft={beerDraft}
                onChange={setBeerDraft}
                onSubmit={addBeerToSession}
                submitLabel="Add Booze"
                loading={addingBeer}
              />
            </Surface>

            <ChugBottleButton onPress={openChugFlow} />

            {!activeCrawl ? (
              <DrinkingBuddiesPicker
                sessionId={activeSession.id}
                disabled={ending || cancelling}
              />
            ) : null}

            <Surface style={styles.formSurface}>
              <Text style={styles.sectionTitle}>Post Details</Text>

              <Text style={styles.sectionLabel}>Comment</Text>
              <View style={[styles.commentContainer, commentFocus.focused ? styles.inputFocused : null]}>
                <MessageSquare color={colors.textMuted} size={20} />
                <MentionComposer
                  containerStyle={styles.commentMentionComposer}
                  inputStyle={styles.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  mentions={postMentions}
                  onMentionsChange={setPostMentions}
                  currentUserId={activeSession?.user_id || null}
                  placeholder="Add a tasting note, rating, or story..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={220}
                  textAlignVertical="top"
                  onFocus={commentFocus.onFocus}
                  onBlur={() => {
                    commentFocus.onBlur();
                    saveActiveSessionComment(comment);
                  }}
                />
              </View>
              <Text style={styles.characterCount}>{comment.length}/220</Text>

              <TouchableOpacity
                style={[styles.photoButton, savingPhoto ? styles.photoButtonSaving : null]}
                onPress={() => setPhotoChoiceVisible(true)}
                disabled={savingPhoto}
                activeOpacity={0.76}
              >
                {previewImageUri ? (
                  <Image source={{ uri: previewImageUri }} style={styles.imagePreview} />
                ) : (
                  <>
                    <Camera color={colors.primary} size={24} />
                    <Text style={styles.photoText}>Add Photo</Text>
                  </>
                )}
                {savingPhoto ? (
                  <View style={styles.photoSavingOverlay}>
                    <ActivityIndicator color={colors.background} size="small" />
                    <Text style={styles.photoSavingText}>Saving photo...</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              {selectedImages.length > 0 ? (
                <View style={styles.photoStripBlock}>
                  <View style={styles.photoStripHeader}>
                    <Text style={styles.photoStripTitle}>Session photos</Text>
                    <Text style={styles.photoStripCount}>{selectedPhotoCountLabel}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.photoStripContent}
                  >
                    {selectedImages.map((image, index) => {
                      const isKeeper = index === keeperIndex;
                      return (
                        <View
                          key={`${image.uri}-${index}`}
                          style={[styles.photoTile, isKeeper ? styles.photoTileKeeper : null]}
                        >
                          <Image source={{ uri: image.uri }} style={styles.photoTileImage} />
                          <TouchableOpacity
                            style={[styles.keeperButton, isKeeper ? styles.keeperButtonActive : null]}
                            onPress={() => chooseKeeperImage(index)}
                            disabled={savingPhoto}
                            activeOpacity={0.78}
                            accessibilityRole="button"
                            accessibilityLabel={`Make photo ${index + 1} the keeper`}
                          >
                            <Star
                              color={isKeeper ? colors.background : colors.primary}
                              fill={isKeeper ? colors.background : 'transparent'}
                              size={15}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.removePhotoChip}
                            onPress={() => removeSelectedImage(index)}
                            disabled={savingPhoto}
                            activeOpacity={0.78}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove photo ${index + 1}`}
                          >
                            <X color={colors.background} size={14} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                    {selectedImages.length < MAX_SESSION_PHOTOS ? (
                      <TouchableOpacity
                        style={styles.addPhotoTile}
                        onPress={() => setPhotoChoiceVisible(true)}
                        disabled={savingPhoto}
                        activeOpacity={0.76}
                        accessibilityRole="button"
                        accessibilityLabel="Add another session photo"
                      >
                        <PlusCircle color={colors.primary} size={22} />
                      </TouchableOpacity>
                    ) : null}
                  </ScrollView>
                  <Text style={styles.photoKeeperHint}>Starred photo stays. Others disappear after 24 hours.</Text>
                </View>
              ) : null}

              {activeCrawl && crawlPubAction !== 'next' ? (
                <View style={{ marginBottom: 12 }}>
                  <AppButton label="Move to next bar" onPress={handleNextCrawlStop} loading={crawlBusy} />
                </View>
              ) : null}

              <View style={styles.endActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={activeCrawl ? handleCancelCrawl : cancelSession}
                  disabled={cancelling}
                  activeOpacity={0.76}
                >
                  <Text style={styles.cancelText}>{cancelling ? 'Cancelling...' : 'Cancel'}</Text>
                </TouchableOpacity>
                <View style={styles.endButtonWrap}>
                  {activeCrawl ? (
                    <AppButton
                      label="End Pub Crawl"
                      variant="danger"
                      style={styles.pubCrawlEndButton}
                      onPress={handleEndPubCrawl}
                      loading={crawlBusy && photoWarningAction !== 'end'}
                    />
                  ) : (
                    <AppButton label="End Session" onPress={endSession} loading={ending} />
                  )}
                </View>
              </View>
            </Surface>

          </>
        )}
      </View>

      <ChugAttemptModal
        visible={chugVisible}
        mutualFollowers={mutualFollowers}
        selectedBeer={chugSelectedBeer}
        selectedVerifierId={chugSelectedVerifierId}
        analysisPreview={chugAnalysisPreview}
        needsManualTiming={chugNeedsManualTiming}
        analyzing={chugAnalyzing}
        busy={chugBusy}
        error={chugError}
        onClose={() => setChugVisible(false)}
        onCreateBeer={createChugBeer}
        onSelectVerifier={setChugSelectedVerifierId}
        onRecord={recordChugVideo}
        onRetry={recordChugVideo}
        onAccept={acceptChugAttempt}
        onSubmitManualTiming={sendChugForManualTiming}
      />

      <PubRouletteModal
        visible={rouletteVisible}
        pubs={roulettePubs}
        loading={rouletteLoading && roulettePubs.length === 0}
        refreshing={rouletteLoading && roulettePubs.length > 0}
        error={rouletteError}
        starting={starting}
        onClose={closePubRoulette}
        onRefresh={loadRoulettePubs}
        onUsePub={useRoulettePub}
        onStartHere={startRouletteSession}
      />

      <Modal
        visible={!!photoWarningAction}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoWarningAction(null)}
      >
        <View style={styles.photoChoiceBackdrop}>
          <View style={styles.photoChoiceSheet}>
            <View style={styles.photoChoiceHeader}>
              <Text style={styles.photoChoiceTitle}>No Photo Added</Text>
              <TouchableOpacity
                style={styles.photoChoiceClose}
                onPress={() => setPhotoWarningAction(null)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X color={colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { marginBottom: 12 }]}>
              Are you sure you want to move on without a photo?
            </Text>

            <TouchableOpacity style={styles.photoChoiceOption} onPress={() => { photoWarningBypassAction.current = null; setPhotoWarningAction(null); setPhotoChoiceVisible(true); }} activeOpacity={0.76}>
              <View style={styles.photoChoiceIcon}>
                <Camera color={colors.primary} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Add Photo</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoChoiceOption} onPress={() => {
              const action = photoWarningAction;
              setPhotoWarningAction(null);
              photoWarningBypassAction.current = action;
              if (action === 'next') handleNextCrawlStop();
              else if (action === 'end') handleEndPubCrawl();
            }} activeOpacity={0.76}>
              <View style={[styles.photoChoiceIcon, {backgroundColor: colors.surface}]}>
                <CheckCircle2 color={colors.textMuted} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Move On</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pubCategoryChoiceVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPubCategoryChoiceVisible(false)}
      >
        <View style={styles.photoChoiceBackdrop}>
          <View style={styles.photoChoiceSheet}>
            <View style={styles.photoChoiceHeader}>
              <Text style={styles.photoChoiceTitle}>Choose place type</Text>
              <TouchableOpacity
                style={styles.photoChoiceClose}
                onPress={() => setPubCategoryChoiceVisible(false)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X color={colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.photoChoiceOption}
              onPress={() => addTypedPub('pub')}
              disabled={addingPub}
              activeOpacity={0.76}
            >
              <View style={styles.photoChoiceIcon}>
                <Beer color={colors.primary} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Pub</Text>
                <Text style={styles.photoChoiceHint}>Counts toward Pub Legends</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoChoiceOption}
              onPress={() => addTypedPub('other')}
              disabled={addingPub}
              activeOpacity={0.76}
            >
              <View style={[styles.photoChoiceIcon, { backgroundColor: colors.surface }]}>
                <Home color={colors.textMuted} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Other</Text>
                <Text style={styles.photoChoiceHint}>Excluded from Pub Legends</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={photoChoiceVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoChoiceVisible(false)}
      >
        <View style={styles.photoChoiceBackdrop}>
          <View style={styles.photoChoiceSheet}>
            <View style={styles.photoChoiceHeader}>
              <Text style={styles.photoChoiceTitle}>Add Photo</Text>
              <TouchableOpacity
                style={styles.photoChoiceClose}
                onPress={() => setPhotoChoiceVisible(false)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X color={colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.photoChoiceOption} onPress={takePhoto} activeOpacity={0.76}>
              <View style={styles.photoChoiceIcon}>
                <Camera color={colors.primary} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Take Photo</Text>
                <Text style={styles.photoChoiceHint}>Open camera</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoChoiceOption} onPress={chooseFromLibrary} activeOpacity={0.76}>
              <View style={styles.photoChoiceIcon}>
                <Images color={colors.primary} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Upload Photo</Text>
                <Text style={styles.photoChoiceHint}>Choose from library</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === 'web' ? floatingTabBarMetrics.webContentInset : 0,
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 18 : 60,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'web' ? 14 : 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  content: {
    padding: Platform.OS === 'web' ? 16 : 20,
    gap: spacing.lg,
  },
  formSurface: {
    gap: spacing.sm,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  introTitle: {
    ...typography.h3,
    flex: 1,
    minWidth: 0,
  },
  nearbyButton: {
    minHeight: 38,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  nearbyButtonActive: {
    opacity: 0.78,
  },
  nearbyButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  addPubFooter: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  addPubIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  addPubText: {
    flex: 1,
    minWidth: 0,
  },
  addPubTitle: {
    ...typography.body,
    fontWeight: '800',
  },
  addPubHint: {
    ...typography.caption,
    marginTop: 2,
  },
  quickPubList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -8,
    marginBottom: 4,
  },
  quickPubChip: {
    maxWidth: '100%',
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  quickPubText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
  },
  selectedPubBox: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.30)',
    backgroundColor: colors.successSoft,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -6,
    marginBottom: 4,
  },
  selectedPubText: {
    flex: 1,
    minWidth: 0,
  },
  selectedPubName: {
    ...typography.body,
    fontWeight: '800',
  },
  selectedPubDetail: {
    ...typography.caption,
    marginTop: 2,
  },
  pubSearchHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -6,
  },
  pubSearchError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: -6,
  },
  rouletteCta: {
    minHeight: 108,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 20,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#2A063D',
    borderWidth: 2,
    borderColor: '#FACC15',
    overflow: 'hidden',
    ...shadows.card,
  },
  rouletteCtaColorRail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 9,
    flexDirection: 'row',
  },
  rouletteCtaRailSegment: {
    flex: 1,
  },
  rouletteCtaRailRed: {
    backgroundColor: '#E11D48',
  },
  rouletteCtaRailGold: {
    backgroundColor: '#FACC15',
  },
  rouletteCtaRailBlue: {
    backgroundColor: '#0EA5E9',
  },
  rouletteCtaRailGreen: {
    backgroundColor: '#16A34A',
  },
  rouletteCtaRailPurple: {
    backgroundColor: '#7C3AED',
  },
  rouletteCtaDisabled: {
    opacity: 0.68,
  },
  rouletteCtaIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FDE68A',
    transform: [{ rotate: '-6deg' }],
  },
  rouletteCtaText: {
    flex: 1,
    minWidth: 0,
  },
  rouletteCtaKicker: {
    ...typography.tiny,
    color: '#38BDF8',
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  rouletteCtaTitle: {
    ...typography.body,
    color: '#FDE68A',
    fontWeight: '900',
    marginTop: 2,
  },
  rouletteCtaSubtitle: {
    ...typography.h3,
    marginTop: 2,
    color: colors.text,
  },
  rouletteCtaJackpot: {
    minWidth: 50,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E11D48',
    borderWidth: 2,
    borderColor: '#FDE68A',
    transform: [{ rotate: '5deg' }],
  },
  rouletteCtaJackpotText: {
    ...typography.body,
    color: '#FDE68A',
    fontWeight: '900',
  },
  lockedPubSurface: {
    gap: spacing.md,
    ...shadows.card,
  },
  lockedPubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  lockedPubIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  lockedPubText: {
    flex: 1,
    minWidth: 0,
  },
  lockedPubLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  lockedPubName: {
    ...typography.h3,
    marginTop: 2,
  },
  crawlConvertButton: {
    width: 104,
    minHeight: 104,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  crawlConvertButtonDisabled: {
    opacity: 0.68,
  },
  crawlConvertKicker: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  crawlConvertLabel: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  startedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  startedText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typography.h3,
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  emptyBeerList: {
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    gap: 8,
  },
  emptyBeerText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  beerList: {
    gap: 10,
  },
  beerRow: {
    minHeight: 62,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  beerRowLogo: {
    width: 26,
    height: 25,
    resizeMode: 'contain',
  },
  beerRowText: {
    flex: 1,
    minWidth: 0,
  },
  beerRowTitle: {
    ...typography.body,
    fontWeight: '800',
  },
  beerRowMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  beerRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  incrementBeerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  removeBeerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  sectionLabel: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 8,
  },
  commentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 16,
    minHeight: 104,
    gap: 12,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  commentMentionComposer: {
    flex: 1,
  },
  commentInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    minHeight: 72,
    padding: 0,
  },
  characterCount: {
    ...typography.caption,
    textAlign: 'right',
    marginBottom: 14,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    height: Platform.OS === 'web' ? 132 : 150,
    marginBottom: spacing.md,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  photoButtonSaving: {
    opacity: 0.88,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoSavingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(18, 24, 38, 0.58)',
  },
  photoSavingText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '800',
  },
  photoText: {
    ...typography.body,
    color: colors.primary,
    marginLeft: 8,
    fontWeight: '600',
  },
  photoStripBlock: {
    marginTop: -4,
    marginBottom: spacing.md,
  },
  photoStripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  photoStripTitle: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
  },
  photoStripCount: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  photoStripContent: {
    gap: 10,
    paddingRight: 4,
  },
  photoTile: {
    width: 82,
    height: 82,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  photoTileKeeper: {
    borderColor: colors.primary,
  },
  photoTileImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  keeperButton: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  keeperButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  removePhotoChip: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
  },
  addPhotoTile: {
    width: 82,
    height: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoKeeperHint: {
    ...typography.caption,
    marginTop: 8,
    color: colors.textMuted,
  },
  endActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelButton: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cancelText: {
    ...typography.body,
    fontWeight: '800',
    color: colors.textMuted,
  },
  endButtonWrap: {
    flex: 1,
  },
  pubCrawlEndButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: 'rgba(239, 68, 68, 0.46)',
  },
  photoChoiceBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },
  photoChoiceSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    gap: 12,
  },
  photoChoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  photoChoiceTitle: {
    ...typography.h3,
    color: colors.text,
  },
  photoChoiceClose: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  photoChoiceOption: {
    minHeight: 68,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  photoChoiceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoChoiceText: {
    flex: 1,
  },
  photoChoiceLabel: {
    ...typography.body,
    fontWeight: '800',
  },
  photoChoiceHint: {
    ...typography.caption,
    marginTop: 3,
  },
  crawlPubEditContainer: {
    marginTop: 4,
    gap: 12,
  },
  crawlPubEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  changePubButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  changePubText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
});
