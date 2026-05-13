import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNavigationContainerRef, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
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
import { AuthScreen } from '../screens/AuthScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { EditSessionScreen } from '../screens/EditSessionScreen';
import { HangoverRatingScreen } from '../screens/HangoverRatingScreen';
import { colors } from '../theme/colors';
import { floatingTabBarMetrics, radius, shadows } from '../theme/layout';
import { NotificationsProvider, useNotifications } from '../lib/notificationsContext';
import { syncCurrentTimezone } from '../lib/timezone';

const beervaLogo = require('../../assets/beerva-header-logo.png');

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();
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

type HangoverLaunchParams = {
  targetType: 'session' | 'pub_crawl';
  targetId: string;
  notificationId?: string | null;
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

const clearNotificationLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('notifications');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
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

const MainTabs = () => {
  const { unreadCount } = useNotifications();
  const { width: viewportWidth } = useWindowDimensions();
  const floatingTabBarWidth = Math.min(Math.max(viewportWidth - 32, 0), 520);
  const floatingTabBarLeft = (viewportWidth - floatingTabBarWidth) / 2;

  return (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: colors.background },
      animation: 'fade',
      tabBarStyle: Platform.OS === 'web'
        ? {
            position: 'absolute',
            left: floatingTabBarLeft,
            bottom: floatingTabBarMetrics.webBottom,
            width: floatingTabBarWidth,
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
  const profileCheckedUserIdRef = useRef<string | null>(null);
  const profileCheckRequestIdRef = useRef(0);
  const pendingNotificationsOpenRef = useRef(shouldOpenNotificationsFromUrl());
  const pendingRecordOpenRef = useRef(shouldOpenRecordFromUrl());
  const pendingHangoverOpenRef = useRef<HangoverLaunchParams | null>(getHangoverLaunchParamsFromUrl());
  const sessionUserId = session?.user?.id ?? null;
  const sessionHasCachedUsername = hasCachedUsername(session);

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
      }

      setNeedsProfileSetup(!data?.username);
      profileCheckedUserIdRef.current = userId;
      setProfileCheckedUserId(userId);
    } catch (error) {
      if (profileCheckRequestIdRef.current !== requestId) return;

      console.error('Profile setup check error:', getErrorMessage(error, 'Unknown profile check error'));
      setNeedsProfileSetup(fallbackNeedsProfileSetup);
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

    const pendingHangoverOpen = pendingHangoverOpenRef.current;
    if (pendingHangoverOpen) {
      pendingHangoverOpenRef.current = null;
      navigationRef.navigate('HangoverRating', pendingHangoverOpen);
      clearHangoverLaunchParams();
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
  }, [loading, navigationReady, needsProfileSetup, profileLoading, sessionUserId, waitingForProfileCheck]);

  if (loading || profileLoading || waitingForProfileCheck) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavigationReady(true)} theme={navigationTheme}>
      {session && session.user ? (
        needsProfileSetup ? (
          <ProfileSetupScreen onComplete={() => checkProfileSetup(session, true)} />
        ) : (
          <NotificationsProvider>
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen name="UserProfile" component={UserProfileScreen} />
              <Stack.Screen name="PubLegendDetail" component={PubLegendDetailScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="EditSession" component={EditSessionScreen} />
              <Stack.Screen name="HangoverRating" component={HangoverRatingScreen} />
            </Stack.Navigator>
          </NotificationsProvider>
        )
      ) : (
        <AuthScreen />
      )}
    </NavigationContainer>
  );
};
