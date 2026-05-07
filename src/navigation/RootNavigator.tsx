import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Beer, PlusCircle, User } from 'lucide-react-native';

import { FeedScreen } from '../screens/FeedScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

export const RootNavigator = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderTopWidth: 1,
          },
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
          name="Profile" 
          component={ProfileScreen} 
          options={{
            tabBarIcon: ({ color, size }) => <User color={color} size={size} />
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
