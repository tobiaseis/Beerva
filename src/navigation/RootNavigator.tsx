import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Beer, Plus, User, Users } from 'lucide-react-native';
import { View, ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { FeedScreen } from '../screens/FeedScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { PeopleScreen } from '../screens/PeopleScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { colors } from '../theme/colors';
import { radius, shadows } from '../theme/layout';
import { NotificationsProvider, useNotifications } from '../lib/notificationsContext';
import { hapticLight } from '../lib/haptics';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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

const RecordFab = () => {
  const navigation = useNavigation<any>();
  return (
    <Pressable
      style={({ pressed }) => [fabStyles.fab, pressed ? fabStyles.fabPressed : null]}
      onPress={() => {
        hapticLight();
        navigation.navigate('Record');
      }}
      accessibilityRole="button"
      accessibilityLabel="Record a new session"
    >
      <Plus color={colors.background} size={32} strokeWidth={3} />
    </Pressable>
  );
};

const MainTabs = () => {
  const { unreadCount } = useNotifications();
  return (
  <View style={{ flex: 1 }}>
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
            marginBottom: 12,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderTopWidth: 1,
            borderColor: colors.borderSoft,
            borderTopColor: colors.borderSoft,
            ...shadows.card,
          }
        : {
            backgroundColor: colors.surfaceRaised,
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
        tabBarIcon: ({ color, size }) => <Beer color={color} size={size} />,
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
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ color, size }) => <User color={color} size={size} />
      }}
    />
  </Tab.Navigator>
  <RecordFab />
  </View>
  );
};

export const RootNavigator = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileCheckedUserId, setProfileCheckedUserId] = useState<string | null>(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const profileCheckedUserIdRef = useRef<string | null>(null);

  const checkProfileSetup = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setNeedsProfileSetup(false);
      setProfileCheckedUserId(null);
      profileCheckedUserIdRef.current = null;
      setProfileLoading(false);
      return;
    }

    const userId = activeSession.user.id;
    const isFirstCheckForUser = profileCheckedUserIdRef.current !== userId;

    if (isFirstCheckForUser) {
      setProfileLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Profile setup check error:', error);
      }

      setNeedsProfileSetup(!data?.username);
      profileCheckedUserIdRef.current = userId;
      setProfileCheckedUserId(userId);
    } catch (error) {
      console.error('Profile setup check error:', error);
      setNeedsProfileSetup(true);
      profileCheckedUserIdRef.current = userId;
      setProfileCheckedUserId(userId);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      checkProfileSetup(session);
      setLoading(false);
    }).catch((error) => {
      console.error('Supabase session error:', error);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      checkProfileSetup(session);
    });

    return () => subscription.unsubscribe();
  }, [checkProfileSetup]);

  const waitingForProfileCheck = Boolean(session?.user && profileCheckedUserId !== session.user.id);

  if (loading || profileLoading || waitingForProfileCheck) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {session && session.user ? (
        needsProfileSetup ? (
          <ProfileSetupScreen onComplete={() => checkProfileSetup(session)} />
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
              <Stack.Screen
                name="Record"
                component={RecordScreen}
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="UserProfile" component={UserProfileScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
            </Stack.Navigator>
          </NotificationsProvider>
        )
      ) : (
        <AuthScreen />
      )}
    </NavigationContainer>
  );
};

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Platform.OS === 'web' ? 36 : 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.background,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 10,
  },
  fabPressed: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 0.94 }],
  },
});
