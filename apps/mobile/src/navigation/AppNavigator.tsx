import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { navigationRef } from './navigationRef';

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

function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Groups' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
          />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
            />
            <Stack.Screen
              name="GroupDetail"
              component={GroupDetailScreen}
              options={{ headerShown: true, title: 'Group' }}
            />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{ headerShown: true, title: 'Create Group' }}
            />
            <Stack.Screen
              name="Call"
              component={CallScreen}
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <Stack.Screen
              name="InviteUser"
              component={InviteUserScreen}
              options={{ headerShown: true, title: 'Invite by Username' }}
            />
            <Stack.Screen
              name="Invitations"
              component={InvitationsScreen}
              options={{ headerShown: true, title: 'Invitations' }}
            />
            <Stack.Screen
              name="GroupSettings"
              component={GroupSettingsScreen}
              options={{ headerShown: true, title: 'Group Settings' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
