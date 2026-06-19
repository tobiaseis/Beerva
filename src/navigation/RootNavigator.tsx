import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNavigationContainerRef,
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
  type NavigatorScreenParams,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlusCircle, Trophy, User, Users } from 'lucide-react-native';
import { View, ActivityIndicator, Platform, Image, useWindowDimensions } from 'react-native';
import { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { getErrorMessage, withTimeout } from '../lib/timeouts';
import { FeedScreen } from '../screens/FeedScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { PeopleScreen } from '../screens/PeopleScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { PubLegendsScreen } from '../screens/PubLegendsScreen';
import { PubLegendDetailScreen } from '../screens/PubLegendDetailScreen';
import { ChallengeDetailScreen } from '../screens/ChallengeDetailScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { PostDetailScreen } from '../screens/PostDetailScreen';
import { EditSessionScreen } from '../screens/EditSessionScreen';
import { HangoverRatingScreen } from '../screens/HangoverRatingScreen';
import { ChugVerificationScreen } from '../screens/ChugVerificationScreen';
import { FakeBeerScreen } from '../screens/FakeBeerScreen';
import { AdminToolsScreen } from '../screens/AdminToolsScreen';
import { PushReminderPrompt } from '../components/PushReminderPrompt';
import { colors } from '../theme/colors';
import { floatingTabBarMetrics, radius, shadows } from '../theme/layout';
import { NotificationsProvider, useNotifications } from '../lib/notificationsContext';
import { ChallengeLaunchParams, getChallengeLaunchParamsFromSearch } from '../lib/challengeLaunchParams';
import { getPostLaunchParamsFromSearch, PostLaunchParams } from '../lib/postTargets';
import {
  consumeInitialNativeNotificationTarget,
  NativeNotificationTarget,
  subscribeToNativeNotificationTargets,
} from '../lib/nativeNotificationRouting';
import { syncCurrentTimezone } from '../lib/timezone';
import { BeverageCatalogProvider } from '../lib/beverageCatalogContext';

const beervaLogo = require('../../assets/beerva-header-logo.png');

type MainTabParamList = {
  Feed: undefined;
  People: undefined;
  Record: undefined;
  Legends: undefined;
  Profile: { showPushReminderHint?: boolean } | undefined;
};

type HangoverLaunchParams = {
  targetType: 'session' | 'pub_crawl';
  targetId: string;
  notificationId?: string | null;
};

type ChugVerificationLaunchParams = {
  attemptId: string;
  notificationId?: string | null;
};

type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  UserProfile: { userId: string };
  PubLegendDetail: { pubKey: string; pubId?: string | null; pubName?: string };
  ChallengeDetail: { challengeSlug: string };
  Notifications: undefined;
  PostDetail: {
    targetType?: 'session' | 'pub_crawl';
    targetId?: string;
    sessionId?: string;
    notificationId?: string | null;
  };
  EditSession: { sessionId: string };
  HangoverRating: HangoverLaunchParams;
  ChugVerification: ChugVerificationLaunchParams;
  FakeBeer: undefined;
  AdminTools: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const AUTH_BOOTSTRAP_TIMEOUT_MS = 12000;
const PROFILE_CHECK_TIMEOUT_MS = 12000;
const floatingTabBarBackground = '#172238';

const hasCachedUsername = (activeSession: Session | null) => (
  Boolean(activeSession?.user?.user_metadata?.username)
);

const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.borderSoft,
    notification: colors.primary,
  },
};

const linking: LinkingOptions<RootStackParamList> = {
  enabled: Platform.OS === 'web' || Platform.OS === 'android',
  prefixes: Platform.OS === 'web' ? [] : ['beerva://'],
  config: {
    initialRouteName: 'MainTabs',
    screens: {
      MainTabs: {
        path: '',
        initialRouteName: 'Feed',
        screens: {
          Feed: '',
          People: 'people',
          Record: 'record',
          Legends: 'legends',
          Profile: 'profile',
        },
      },
      UserProfile: 'users/:userId',
      PubLegendDetail: 'pub-legends/:pubKey',
      ChallengeDetail: 'challenges/:challengeSlug',
      Notifications: 'notifications',
      PostDetail: 'posts/:targetType/:targetId',
      EditSession: 'sessions/:sessionId/edit',
      HangoverRating: 'hangover/:targetType/:targetId',
      ChugVerification: 'chug-verification/:attemptId',
      FakeBeer: 'fake-beer',
      AdminTools: 'admin',
    },
  },
};

const shouldOpenNotificationsFromUrl = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('notifications') === '1';
};

const shouldOpenRecordFromUrl = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('tab') === 'record';
};

const getHangoverLaunchParamsFromUrl = (): HangoverLaunchParams | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  // Handles /?hangover=1&target_type=session&target_id=...
  const params = new URLSearchParams(window.location.search);
  if (params.get('hangover') !== '1') return null;

  const rawTargetType = params.get('target_type') || params.get('target');
  const targetType = rawTargetType === 'pub_crawl' || rawTargetType === 'session'
    ? rawTargetType
    : null;
  const targetId = params.get('target_id') || params.get('id');

  if (!targetType || !targetId) return null;

  return {
    targetType,
    targetId,
    notificationId: params.get('notificationId'),
  };
};

const getPostLaunchParamsFromUrl = (): PostLaunchParams | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return getPostLaunchParamsFromSearch(window.location.search);
};

const getChallengeLaunchParamsFromUrl = (): ChallengeLaunchParams | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return getChallengeLaunchParamsFromSearch(window.location.search);
};

const getChugVerificationLaunchParamsFromUrl = (): ChugVerificationLaunchParams | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('chug_verification') !== '1') return null;
  const attemptId = params.get('attempt_id') || params.get('id');
  if (!attemptId) return null;
  return {
    attemptId,
    notificationId: params.get('notificationId'),
  };
};

const clearPostLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('post');
  url.searchParams.delete('post_type');
  url.searchParams.delete('target_type');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const clearNotificationLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('notifications');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const clearChallengeLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('challenge');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const markNotificationRead = (notificationId?: string | null) => {
  if (!notificationId) return;
  supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .then(({ error }) => {
      if (error) console.warn('Could not mark push-opened notification read', error);
    });
};

const clearRecordLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('tab');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const clearHangoverLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('hangover');
  url.searchParams.delete('target_type');
  url.searchParams.delete('target');
  url.searchParams.delete('target_id');
  url.searchParams.delete('id');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const clearChugVerificationLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('chug_verification');
  url.searchParams.delete('attempt_id');
  url.searchParams.delete('id');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const MainTabs = () => {
  const { unreadCount } = useNotifications();
  const { width: viewportWidth } = useWindowDimensions();
  const floatingTabBarWidth = Math.min(Math.max(viewportWidth - 32, 0), 520);

  return (
  <Tab.Navigator
    backBehavior="history"
    screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: colors.background },
      animation: 'fade',
      tabBarStyle: Platform.OS === 'web'
        ? {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: floatingTabBarMetrics.webBottom,
            width: floatingTabBarWidth,
            marginHorizontal: 'auto',
            backgroundColor: floatingTabBarBackground,
            height: floatingTabBarMetrics.webHeight,
            paddingTop: 6,
            paddingBottom: 7,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderTopWidth: 1,
            borderColor: 'rgba(148, 163, 184, 0.18)',
            borderTopColor: 'rgba(148, 163, 184, 0.18)',
            ...shadows.raised,
          }
        : {
            backgroundColor: colors.surfaceRaised,
            height: 64,
            paddingTop: 6,
            paddingBottom: 8,
            borderTopColor: colors.borderSoft,
            borderTopWidth: 1,
          },
      tabBarLabelStyle: Platform.OS === 'web' ? {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 0,
        fontFamily: 'Inter_600SemiBold',
      } : {
        fontFamily: 'Inter_500Medium',
      },
      tabBarItemStyle: Platform.OS === 'web' ? {
        paddingVertical: 5,
        marginHorizontal: 2,
        borderRadius: radius.pill,
      } : undefined,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
    }}
  >
    <Tab.Screen
      name="Feed"
      component={FeedScreen}
      options={{
        tabBarIcon: ({ focused, size }) => (
          <Image
            source={beervaLogo}
            style={{
              width: size,
              height: size,
              resizeMode: 'contain',
              opacity: focused ? 1 : 0.55,
            }}
          />
        ),
        tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
        tabBarBadgeStyle: {
          backgroundColor: colors.danger,
          color: colors.background,
          fontSize: 10,
          fontWeight: '800',
          minWidth: 18,
          height: 18,
          lineHeight: 18,
          borderRadius: 9,
          paddingHorizontal: 4,
        },
      }}
    />
    <Tab.Screen
      name="People"
      component={PeopleScreen}
      options={{
        tabBarIcon: ({ color, size }) => <Users color={color} size={size} />
      }}
    />
    <Tab.Screen
      name="Record"
      component={RecordScreen}
      options={{
        tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} />
      }}
    />
    <Tab.Screen
      name="Legends"
      component={PubLegendsScreen}
      options={{
        tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} />
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ color, size }) => <User color={color} size={size} />
      }}
    />
  </Tab.Navigator>
  );
};

export const RootNavigator = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileCheckedUserId, setProfileCheckedUserId] = useState<string | null>(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [pendingNativeNotificationTarget, setPendingNativeNotificationTarget] =
    useState<NativeNotificationTarget | null>(null);
  const profileCheckedUserIdRef = useRef<string | null>(null);
  const profileCheckRequestIdRef = useRef(0);
  const pendingNotificationsOpenRef = useRef(shouldOpenNotificationsFromUrl());
  const pendingRecordOpenRef = useRef(shouldOpenRecordFromUrl());
  const pendingHangoverOpenRef = useRef<HangoverLaunchParams | null>(getHangoverLaunchParamsFromUrl());
  const pendingPostOpenRef = useRef<PostLaunchParams | null>(getPostLaunchParamsFromUrl());
  const pendingChallengeOpenRef = useRef<ChallengeLaunchParams | null>(getChallengeLaunchParamsFromUrl());
  const pendingChugVerificationOpenRef = useRef<ChugVerificationLaunchParams | null>(getChugVerificationLaunchParamsFromUrl());
  const sessionUserId = session?.user?.id ?? null;
  const sessionHasCachedUsername = hasCachedUsername(session);

  const openPushReminderProfileHint = useCallback(() => {
    if (!navigationRef.isReady()) return;

    navigationRef.navigate('MainTabs', {
      screen: 'Profile',
      params: { showPushReminderHint: true },
    });
  }, []);

  const handleNativeNotificationTarget = useCallback((target: NativeNotificationTarget) => {
    if (!navigationRef.isReady()) return false;

    if (target.kind === 'hangover') {
      navigationRef.navigate('HangoverRating', {
        targetType: target.targetType,
        targetId: target.targetId,
        notificationId: target.notificationId,
      });
      return true;
    }

    if (target.kind === 'post') {
      navigationRef.navigate('PostDetail', {
        targetType: target.targetType,
        targetId: target.targetId,
        notificationId: target.notificationId,
        sessionId: target.targetType === 'session' ? target.targetId : undefined,
      });
      return true;
    }

    if (target.kind === 'chugVerification') {
      navigationRef.navigate('ChugVerification', {
        attemptId: target.attemptId,
        notificationId: target.notificationId,
      });
      return true;
    }

    if (target.kind === 'challenge') {
      navigationRef.navigate('ChallengeDetail', { challengeSlug: target.challengeSlug });
      markNotificationRead(target.notificationId);
      return true;
    }

    if (target.kind === 'record') {
      navigationRef.navigate('MainTabs', { screen: 'Record' });
      return true;
    }

    navigationRef.navigate('Notifications');
    markNotificationRead(target.notificationId);
    return true;
  }, []);

  const checkProfileSetup = useCallback(async (activeSession: Session | null, showLoading = false) => {
    const requestId = profileCheckRequestIdRef.current + 1;
    profileCheckRequestIdRef.current = requestId;

    if (!activeSession?.user) {
      setNeedsProfileSetup(false);
      setProfileCheckedUserId(null);
      profileCheckedUserIdRef.current = null;
      setProfileLoading(false);
      return;
    }

    const userId = activeSession.user.id;
    const fallbackNeedsProfileSetup = !hasCachedUsername(activeSession);
    const isFirstCheckForUser = profileCheckedUserIdRef.current !== userId;

    if (isFirstCheckForUser && !fallbackNeedsProfileSetup) {
      setNeedsProfileSetup(false);
      profileCheckedUserIdRef.current = userId;
      setProfileCheckedUserId(userId);
    } else if (isFirstCheckForUser || showLoading) {
      setProfileLoading(true);
    }

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('username')
          .eq('id', userId)
          .maybeSingle(),
        PROFILE_CHECK_TIMEOUT_MS,
        'Profile check is taking too long. Please try again.'
      );

      if (profileCheckRequestIdRef.current !== requestId) return;

      if (error) {
        console.error('Profile setup check error:', error);
        // If the database query failed (e.g. timeout or connection drop),
        // we shouldn't force the user to the setup screen. It creates the illusion
        // of being signed out. Default to false so they can see the feed's network error.
        setNeedsProfileSetup(false);
      } else {
        setNeedsProfileSetup(!data?.username);
      }
      
      profileCheckedUserIdRef.current = userId;
      setProfileCheckedUserId(userId);
    } catch (error) {
      if (profileCheckRequestIdRef.current !== requestId) return;

      console.error('Profile setup check error:', getErrorMessage(error, 'Unknown profile check error'));
      // On network timeout, assume they don't need setup to avoid aggressive redirect.
      setNeedsProfileSetup(false);
      profileCheckedUserIdRef.current = userId;
      setProfileCheckedUserId(userId);
    } finally {
      if (profileCheckRequestIdRef.current === requestId) {
        setProfileLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    withTimeout(
      supabase.auth.getSession(),
      AUTH_BOOTSTRAP_TIMEOUT_MS,
      'Session check is taking too long.'
    )
      .then(({ data: { session } }) => {
        if (!active) return;
        setSession(session);
      })
      .catch((error) => {
        if (!active) return;
        console.error('Supabase session error:', getErrorMessage(error, 'Unknown session error'));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      active = false;
      profileCheckRequestIdRef.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    checkProfileSetup(session);
  }, [checkProfileSetup, sessionUserId, sessionHasCachedUsername]);

  useEffect(() => {
    if (!sessionUserId) return;
    syncCurrentTimezone().catch((error) => {
      console.warn('Could not sync profile timezone:', error);
    });
  }, [sessionUserId]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    let active = true;

    consumeInitialNativeNotificationTarget()
      .then((target) => {
        if (!active || !target) return;
        setPendingNativeNotificationTarget(target);
      })
      .catch((error) => {
        console.warn('Could not read initial native notification response', error);
      });

    const subscription = subscribeToNativeNotificationTargets((target) => {
      setPendingNativeNotificationTarget(target);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const waitingForProfileCheck = Boolean(
    sessionUserId
    && profileCheckedUserId !== sessionUserId
    && !sessionHasCachedUsername
  );

  useEffect(() => {
    if (
      !navigationReady
      || waitingForProfileCheck
      || loading
      || profileLoading
      || needsProfileSetup
      || !sessionUserId
      || !navigationRef.isReady()
    ) {
      return;
    }

    if (
      pendingNativeNotificationTarget
      && handleNativeNotificationTarget(pendingNativeNotificationTarget)
    ) {
      setPendingNativeNotificationTarget(null);
      return;
    }

    const pendingHangoverOpen = pendingHangoverOpenRef.current;
    if (pendingHangoverOpen) {
      pendingHangoverOpenRef.current = null;
      navigationRef.navigate('HangoverRating', pendingHangoverOpen);
      clearHangoverLaunchParams();
      return;
    }

    const pendingPostOpen = pendingPostOpenRef.current;
    if (pendingPostOpen) {
      pendingPostOpenRef.current = null;
      navigationRef.navigate('PostDetail', {
        targetType: pendingPostOpen.targetType,
        targetId: pendingPostOpen.targetId,
        notificationId: pendingPostOpen.notificationId,
        sessionId: pendingPostOpen.targetType === 'session' ? pendingPostOpen.targetId : undefined,
      });
      clearPostLaunchParams();
      return;
    }

    const pendingChugVerificationOpen = pendingChugVerificationOpenRef.current;
    if (pendingChugVerificationOpen) {
      pendingChugVerificationOpenRef.current = null;
      navigationRef.navigate('ChugVerification', pendingChugVerificationOpen);
      clearChugVerificationLaunchParams();
      return;
    }

    const pendingChallengeOpen = pendingChallengeOpenRef.current;
    if (pendingChallengeOpen) {
      pendingChallengeOpenRef.current = null;
      navigationRef.navigate('ChallengeDetail', { challengeSlug: pendingChallengeOpen.challengeSlug });
      markNotificationRead(pendingChallengeOpen.notificationId);
      clearChallengeLaunchParams();
      return;
    }

    if (pendingNotificationsOpenRef.current) {
      pendingNotificationsOpenRef.current = false;
      navigationRef.navigate('Notifications');
      clearNotificationLaunchParams();
      return;
    }

    if (!pendingRecordOpenRef.current) return;

    pendingRecordOpenRef.current = false;
    navigationRef.navigate('MainTabs', { screen: 'Record' });
    clearRecordLaunchParams();
  }, [
    handleNativeNotificationTarget,
    loading,
    navigationReady,
    needsProfileSetup,
    pendingNativeNotificationTarget,
    profileLoading,
    sessionUserId,
    waitingForProfileCheck,
  ]);

  if (loading || profileLoading || waitingForProfileCheck) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={() => setNavigationReady(true)} theme={navigationTheme}>
      {session && session.user ? (
        needsProfileSetup ? (
          <ProfileSetupScreen onComplete={() => checkProfileSetup(session, true)} />
        ) : (
          <BeverageCatalogProvider>
            <NotificationsProvider>
              <>
                <Stack.Navigator
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    animation: 'slide_from_right',
                    gestureEnabled: true,
                  }}
                >
                  <Stack.Screen name="MainTabs" component={MainTabs} />
                  <Stack.Screen name="UserProfile" component={UserProfileScreen} />
                  <Stack.Screen name="PubLegendDetail" component={PubLegendDetailScreen} />
                  <Stack.Screen name="ChallengeDetail" component={ChallengeDetailScreen} />
                  <Stack.Screen name="Notifications" component={NotificationsScreen} />
                  <Stack.Screen name="PostDetail" component={PostDetailScreen} />
                  <Stack.Screen name="EditSession" component={EditSessionScreen} />
                  <Stack.Screen name="HangoverRating" component={HangoverRatingScreen} />
                  <Stack.Screen name="ChugVerification" component={ChugVerificationScreen} />
                  <Stack.Screen name="FakeBeer" component={FakeBeerScreen} options={{ animation: 'none' }} />
                  <Stack.Screen name="AdminTools" component={AdminToolsScreen} />
                </Stack.Navigator>
                <PushReminderPrompt onShowProfileHint={openPushReminderProfileHint} />
              </>
            </NotificationsProvider>
          </BeverageCatalogProvider>
        )
      ) : (
        <AuthScreen />
      )}
    </NavigationContainer>
  );
};
