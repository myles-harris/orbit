import React from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { navigationRef } from './navigationRef';
import { useTheme } from '../context/ThemeContext';

// Screens
import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import CallScreen from '../screens/CallScreen';
import SettingsScreen from '../screens/SettingsScreen';
import InviteUserScreen from '../screens/InviteUserScreen';
import InvitationsScreen from '../screens/InvitationsScreen';
import GroupSettingsScreen from '../screens/GroupSettingsScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  GroupDetail: { groupId: string };
  CreateGroup: undefined;
  Call: { callId: string; groupId: string; roomUrl: string; token: string; endsAt?: string };
  InviteUser: { groupId: string };
  Invitations: undefined;
  GroupSettings: { groupId: string; isOwner: boolean };
};

export type MainTabParamList = {
  Home: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const { theme: { colors } } = useTheme();
  const color = focused ? colors.tabActive : colors.tabInactive;
  if (name === 'Home') return <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />;
  if (name === 'Settings') return <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={color} />;
  return null;
}

function MainTabs() {
  const { theme: { colors, typography } } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 84,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '500',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        },
        headerStyle: { backgroundColor: colors.surface, borderBottomColor: colors.border },
        headerTitleStyle: { ...typography.h4 },
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Groups', tabBarLabel: 'Groups' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Profile', tabBarLabel: 'Profile', headerShown: false }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { theme: { colors, typography } } = useTheme();

  const sharedHeaderOptions = {
    headerStyle: { backgroundColor: colors.surface },
    headerTitleStyle: { ...typography.h4 },
    headerTintColor: colors.primary,
    headerShadowVisible: false,
    headerBackTitleVisible: false,
  };

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="GroupDetail"
              component={GroupDetailScreen}
              options={{ headerShown: true, title: 'Group', ...sharedHeaderOptions }}
            />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{ headerShown: true, title: 'New Group', ...sharedHeaderOptions }}
            />
            <Stack.Screen
              name="Call"
              component={CallScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <Stack.Screen
              name="InviteUser"
              component={InviteUserScreen}
              options={{ headerShown: true, title: 'Add Member', ...sharedHeaderOptions }}
            />
            <Stack.Screen
              name="Invitations"
              component={InvitationsScreen}
              options={{ headerShown: true, title: 'Invitations', ...sharedHeaderOptions }}
            />
            <Stack.Screen
              name="GroupSettings"
              component={GroupSettingsScreen}
              options={{ headerShown: true, title: 'Group Settings', ...sharedHeaderOptions }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
