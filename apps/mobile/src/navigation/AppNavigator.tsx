import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
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
import GroupSettingsScreen from '../screens/GroupSettingsScreen';
import JoinInviteScreen from '../screens/JoinInviteScreen';

export type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  Account: undefined;
  GroupDetail: { groupId: string };
  CreateGroup: undefined;
  Call: { callId: string; groupId: string; roomUrl: string; token: string; endsAt?: string };
  InviteUser: { groupId: string };
  GroupSettings: { groupId: string; isOwner: boolean };
  // Optional: the screen can mount without params if the navigator falls back to
  // it, or a malformed orbit://invite/ link is opened.
  JoinInvite: { code: string } | undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const linking = {
  prefixes: ['orbit://'],
  config: {
    screens: {
      JoinInvite: 'invite/:code',
      GroupDetail: 'group/:groupId',
    },
  },
};

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
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={isAuthenticated ? 'Home' : 'Auth'}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            {/* Pushed from the header avatar — no tab bar, no tab-navigator wrapper. */}
            <Stack.Screen name="Account" component={SettingsScreen} />
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
              options={{
                headerShown: false,
                // The default iOS modal presentation insets the card by the status-bar
                // height, rounds the top corners, and exposes the screen underneath,
                // roughly 69pt of lost video on a notched device. forVerticalIOS keeps
                // the slide-up entrance with none of the inset.
                ...TransitionPresets.ModalSlideFromBottomIOS,
                // Leave is the only exit from a call. Must follow the spread above, which
                // sets gestureDirection but not gestureEnabled.
                gestureEnabled: false,
                // Hold current behaviour: the modal presentation did not detach the screen
                // below, and this change should not silently start doing so.
                detachPreviousScreen: false,
              }}
            />
            <Stack.Screen
              name="InviteUser"
              component={InviteUserScreen}
              options={{ headerShown: true, title: 'Add Member', ...sharedHeaderOptions }}
            />
            <Stack.Screen
              name="GroupSettings"
              component={GroupSettingsScreen}
              options={{ headerShown: true, title: 'Group Settings', ...sharedHeaderOptions }}
            />
          </>
        )}
        {/*
          Registered outside the auth conditional so orbit://invite/:code resolves
          before sign-in. Declared last, and initialRouteName is set explicitly, so
          it can never become the implicit initial route on a cold launch.
        */}
        <Stack.Screen
          name="JoinInvite"
          component={JoinInviteScreen}
          options={{ headerShown: true, title: 'Join Group', ...sharedHeaderOptions }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
