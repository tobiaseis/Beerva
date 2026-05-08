import React, { useCallback, useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Beer, PlusCircle, User, Users } from 'lucide-react-native';
import { View, ActivityIndicator, Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { FeedScreen } from '../screens/FeedScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { PeopleScreen } from '../screens/PeopleScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: colors.card,
        borderTopColor: colors.border,
        borderTopWidth: 1,
        ...(Platform.OS === 'web' ? {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        } : null),
      },
      tabBarLabelStyle: Platform.OS === 'web' ? {
        fontSize: 12,
        fontWeight: '600',
        paddingBottom: 2,
      } : undefined,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
    }}
  >
    <Tab.Screen
      name="Feed"
      component={FeedScreen}
      options={{
        tabBarIcon: ({ color, size }) => <Beer color={color} size={size} />
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

export const RootNavigator = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  const checkProfileSetup = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setNeedsProfileSetup(false);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', activeSession.user.id)
        .maybeSingle();

      if (error) {
        console.error('Profile setup check error:', error);
      }

      setNeedsProfileSetup(!data?.username);
    } catch (error) {
      console.error('Profile setup check error:', error);
      setNeedsProfileSetup(true);
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

  if (loading || profileLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session && session.user ? (
        needsProfileSetup ? (
          <ProfileSetupScreen onComplete={() => checkProfileSetup(session)} />
        ) : (
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          </Stack.Navigator>
        )
      ) : (
        <AuthScreen />
      )}
    </NavigationContainer>
  );
};
