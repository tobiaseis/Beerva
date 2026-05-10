import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNavigationContainerRef, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlusCircle, User, Users } from 'lucide-react-native';
import { View, ActivityIndicator, Platform, Image } from 'react-native';
import { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { getErrorMessage, withTimeout } from '../lib/timeouts';
import { FeedScreen } from '../screens/FeedScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { PeopleScreen } from '../screens/PeopleScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { EditSessionScreen } from '../screens/EditSessionScreen';
import { colors } from '../theme/colors';
import { radius, shadows } from '../theme/layout';
import { NotificationsProvider, useNotifications } from '../lib/notificationsContext';

const beervaLogo = require('../../assets/beerva-header-logo.png');

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();
const AUTH_BOOTSTRAP_TIMEOUT_MS = 12000;
const PROFILE_CHECK_TIMEOUT_MS = 12000;

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

const clearNotificationLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('notifications');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const MainTabs = () => {
  const { unreadCount } = useNotifications();
  return (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: colors.background },
      animation: 'fade',
      tabBarStyle: Platform.OS === 'web'
        ? {
            backgroundColor: colors.surfaceRaised,
            height: 64,
            paddingTop: 8,
            paddingBottom: 8,
            marginHorizontal: 12,
            marginBottom: 8,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderTopWidth: 1,
            borderColor: colors.borderSoft,
            borderTopColor: colors.borderSoft,
            ...shadows.card,
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
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
        fontFamily: 'Inter_600SemiBold',
      } : {
        fontFamily: 'Inter_500Medium',
      },
      tabBarItemStyle: Platform.OS === 'web' ? {
        paddingVertical: 4,
        borderRadius: radius.lg,
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
      name="Record"
      component={RecordScreen}
      options={{
        tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} />
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
  const sessionUserId = session?.user?.id ?? null;

  const checkProfileSetup = useCallback(async (userId: string | null, showLoading = false) => {
    const requestId = profileCheckRequestIdRef.current + 1;
    profileCheckRequestIdRef.current = requestId;

    if (!userId) {
      setNeedsProfileSetup(false);
      setProfileCheckedUserId(null);
      profileCheckedUserIdRef.current = null;
      setProfileLoading(false);
      return;
    }

    const isFirstCheckForUser = profileCheckedUserIdRef.current !== userId;

    if (isFirstCheckForUser || showLoading) {
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
      setNeedsProfileSetup(true);
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
    checkProfileSetup(sessionUserId);
  }, [checkProfileSetup, sessionUserId]);

  const waitingForProfileCheck = Boolean(sessionUserId && profileCheckedUserId !== sessionUserId);

  useEffect(() => {
    if (
      !pendingNotificationsOpenRef.current
      || !navigationReady
      || waitingForProfileCheck
      || loading
      || profileLoading
      || needsProfileSetup
      || !sessionUserId
      || !navigationRef.isReady()
    ) {
      return;
    }

    pendingNotificationsOpenRef.current = false;
    navigationRef.navigate('Notifications' as never);
    clearNotificationLaunchParams();
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
          <ProfileSetupScreen onComplete={() => checkProfileSetup(sessionUserId, true)} />
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
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="EditSession" component={EditSessionScreen} />
            </Stack.Navigator>
          </NotificationsProvider>
        )
      ) : (
        <AuthScreen />
      )}
    </NavigationContainer>
  );
};
