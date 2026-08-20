import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { UserDTO, parseApiError } from '@orbit/shared';
import { useAuth } from '../context/AuthContext';
import { useTutorial } from '../context/TutorialContext';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { UserAvatar } from '../components/UserAvatar';
import { syncCallChannel } from '../utils/notificationChannels';

export default function SettingsScreen() {
  const { onLogout } = useAuth();
  const { showTutorial } = useTutorial();
  const { theme: { colors, shadow }, mode, toggleTheme } = useTheme();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notifySound, setNotifySound] = useState(true);
  const [notifyVibrate, setNotifyVibrate] = useState(true);
  const [notifyBreakFocus, setNotifyBreakFocus] = useState(false);

  const styles = useMemo(() => makeStyles(colors, shadow), [colors]);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const userData = await client.get<UserDTO>('/me');
      setUser(userData);
      setNotifySound(userData.notify_sound ?? true);
      setNotifyVibrate(userData.notify_vibrate ?? true);
      setNotifyBreakFocus(userData.notify_break_focus ?? false);
    } catch (error: any) {
      if (error.message?.includes('401')) {
        Alert.alert('Session Expired', 'Please log in again.', [
          { text: 'Log In', onPress: () => onLogout() },
        ]);
      }
    }
  };

  const AVATAR_MAX_EDGE = 512;
  const AVATAR_JPEG_QUALITY = 0.8;

  const pickAndUploadAvatar = async () => {
    // iOS: with allowsEditing: true, expo-image-picker uses UIImagePickerController, which
    // has needed no photo-library authorization since iOS 11. Requesting it anyway calls
    // PHPhotoLibrary.requestAuthorization(.readWrite) — which hard-crashes without
    // NSPhotoLibraryUsageDescription and, with it, adds a prompt users can deny themselves
    // out of a flow that would have worked. Android < 13 does need the storage permissions;
    // Android 13+ resolves to an empty permission set.
    if (Platform.OS === 'android') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Allow access to your photo library to set a profile picture.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,     // no lossy pass here; the manipulator performs the single re-encode
      base64: false,  // never base64-encode the full-resolution asset
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.uri) return;

    setUploadingAvatar(true);
    try {
      // Never upscale — a picture already smaller than the target is left at its own size.
      const targetWidth = Math.min(AVATAR_MAX_EDGE, asset.width || AVATAR_MAX_EDGE);

      // Omitting `height` preserves aspect ratio. The crop UI yields 1:1; if a platform
      // ever returns a non-square asset, UserAvatar's `cover` handles it without distortion.
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize({ width: targetWidth });
      const rendered = await context.renderAsync();
      const image = await rendered.saveAsync({
        compress: AVATAR_JPEG_QUALITY,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!image.base64) throw new Error('encode_failed');

      // Show the resized file immediately — identical bytes to what we're about to upload,
      // so this cannot desync. Cleared only on failure or removal.
      setLocalAvatarUri(image.uri);

      const client = await createAuthenticatedApiClient();
      await client.uploadAvatar(image.base64, 'image/jpeg');
      await loadUser();
    } catch (error) {
      console.error('[avatar-upload] failed:', error);
      setLocalAvatarUri(null);
      Alert.alert('Error', avatarErrorMessage(error));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const client = await createAuthenticatedApiClient();
      await client.deleteAvatar();
      setLocalAvatarUri(null);
      await loadUser();
    } catch (error) {
      console.error('[avatar-delete] failed:', error);
      Alert.alert('Error', avatarErrorMessage(error));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarPress = () => {
    if (!user?.has_avatar && !localAvatarUri) {
      void pickAndUploadAvatar();
      return;
    }
    Alert.alert('Profile Picture', undefined, [
      { text: 'Choose new photo', onPress: () => void pickAndUploadAvatar() },
      { text: 'Remove photo', style: 'destructive', onPress: () => void removeAvatar() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const updatePref = useCallback(async (field: string, value: boolean) => {
    if (field === 'notify_sound') setNotifySound(value);
    if (field === 'notify_vibrate') setNotifyVibrate(value);
    if (field === 'notify_break_focus') setNotifyBreakFocus(value);
    try {
      const client = await createAuthenticatedApiClient();
      await client.patch('/me', { [field]: value });
    } catch {
      if (field === 'notify_sound') setNotifySound(!value);
      if (field === 'notify_vibrate') setNotifyVibrate(!value);
      if (field === 'notify_break_focus') setNotifyBreakFocus(!value);
      Alert.alert('Error', 'Could not save preference. Please try again.');
    }
  }, []);

  const onToggleSound = useCallback(async (value: boolean) => {
    await updatePref('notify_sound', value);
    await syncCallChannel({ sound: value, vibrate: notifyVibrate, breakFocus: notifyBreakFocus });
  }, [notifyVibrate, notifyBreakFocus, updatePref]);

  const onToggleVibrate = useCallback(async (value: boolean) => {
    await updatePref('notify_vibrate', value);
    await syncCallChannel({ sound: notifySound, vibrate: value, breakFocus: notifyBreakFocus });
  }, [notifySound, notifyBreakFocus, updatePref]);

  const onToggleBreakFocus = useCallback(async (value: boolean) => {
    await updatePref('notify_break_focus', value);
    if (Platform.OS === 'android') {
      const channelId = await syncCallChannel({ sound: notifySound, vibrate: notifyVibrate, breakFocus: value });
      const channel = channelId ? await Notifications.getNotificationChannelAsync(channelId) : null;
      if (value && !channel?.bypassDnd) {
        Alert.alert(
          'One more step',
          'Android needs Do Not Disturb access to let Orbit calls through.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open settings',
              onPress: () => IntentLauncher.startActivityAsync(
                'android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS',
              ),
            },
          ],
        );
      }
    }
  }, [notifySound, notifyVibrate, updatePref]);

  const logout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: () => onLogout(),
      },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.logoText}>orbit</Text>

      {/* Profile header */}
      <View style={styles.profileCard}>
        <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.75} style={styles.avatarWrapper}>
          <UserAvatar
            userId={user.id}
            username={user.username}
            hasAvatar={user.has_avatar}
            size={80}
            colors={colors}
            isOwner
            avatarUpdatedAt={user.avatar_updated_at}
            previewUri={localAvatarUri}
          />
          {uploadingAvatar && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.username}>{user.username}</Text>
        <Text style={styles.phone}>{user.phone}</Text>
      </View>

      {/* Profile info */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Profile</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Username</Text>
            <Text style={styles.rowValue}>{user.username}</Text>
          </View>
          <View style={[styles.row, styles.rowBorderless]}>
            <Text style={styles.rowLabel}>Timezone</Text>
            <Text style={styles.rowValue}>{user.time_zone}</Text>
          </View>
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Chime on call start</Text>
            <Switch
              value={notifySound}
              onValueChange={onToggleSound}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Vibrate on call start</Text>
            <Switch
              value={notifyVibrate}
              onValueChange={onToggleVibrate}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <View style={[styles.row, styles.rowBorderless]}>
            <Text style={styles.rowLabel}>
              {Platform.OS === 'ios' ? 'Let calls through Focus' : 'Let calls through Do Not Disturb'}
            </Text>
            <Switch
              value={notifyBreakFocus}
              onValueChange={onToggleBreakFocus}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>
        <Text style={styles.helperText}>
          {Platform.OS === 'ios'
            ? 'Off by default — Orbit stays quiet during Focus. You can also control Time Sensitive alerts in iOS Settings.'
            : 'Off by default — Orbit stays quiet during Do Not Disturb. Turning this on requires Do Not Disturb access in system settings.'}
        </Text>
      </View>

      {/* Appearance toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBorderless]}>
            <Text style={styles.rowLabel}>Theme</Text>
            <View style={styles.themeToggle}>
              <TouchableOpacity
                style={[styles.themeOption, mode === 'dark' && styles.themeOptionActive]}
                onPress={() => mode !== 'dark' && toggleTheme()}
                activeOpacity={0.75}
              >
                <Ionicons name="moon" size={13} color={mode === 'dark' ? colors.primary : colors.textTertiary} />
                <Text style={[styles.themeOptionText, mode === 'dark' && styles.themeOptionTextActive]}>
                  Dark
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.themeOption, mode === 'light' && styles.themeOptionActive]}
                onPress={() => mode !== 'light' && toggleTheme()}
                activeOpacity={0.75}
              >
                <Ionicons name="sunny" size={13} color={mode === 'light' ? colors.primary : colors.textTertiary} />
                <Text style={[styles.themeOptionText, mode === 'light' && styles.themeOptionTextActive]}>
                  Light
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={showTutorial} activeOpacity={0.75}>
            <Text style={styles.rowLabel}>How it works</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>App</Text>
            <Text style={styles.rowValue}>Orbit</Text>
          </View>
          <View style={[styles.row, styles.rowBorderless]}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>0.1.0</Text>
          </View>
        </View>
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.75}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function avatarErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'encode_failed') {
    return "Orbit couldn't process that photo. Try a different one.";
  }
  return parseApiError(error);
}

function makeStyles(colors: any, shadow: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    logoText: {
      fontFamily: 'Chango_400Regular',
      fontSize: 64,
      color: colors.text,
      textAlign: 'center',
      marginTop: 72,
      marginBottom: spacing.sm,
    },
    profileCard: {
      backgroundColor: colors.surface,
      margin: spacing.xl,
      borderRadius: radius.xl,
      padding: spacing.xxl,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarWrapper: {
      marginBottom: spacing.lg,
      position: 'relative',
    },
    avatarOverlay: {
      position: 'absolute',
      inset: 0,
      borderRadius: radius.xl,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarEditBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 22,
      height: 22,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.surface,
    },
    username: {
      fontSize: 22,
      fontFamily: 'RobotoMono_700Bold',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    phone: {
      fontSize: 14,
      fontFamily: 'RobotoMono_400Regular',
      color: colors.textTertiary,
    },
    section: { marginHorizontal: spacing.xl, marginBottom: spacing.xl },
    sectionLabel: {
      fontSize: 12,
      fontFamily: 'RobotoMono_500Medium',
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowBorderless: { borderBottomWidth: 0 },
    helperText: {
      fontSize: 12,
      fontFamily: 'RobotoMono_400Regular',
      color: colors.textTertiary,
      marginTop: spacing.sm,
      marginLeft: spacing.xs,
      lineHeight: 18,
    },
    rowLabel: {
      fontSize: 16,
      fontFamily: 'RobotoMono_400Regular',
      color: colors.textSecondary,
    },
    rowValue: {
      fontSize: 16,
      fontFamily: 'RobotoMono_500Medium',
      color: colors.text,
    },
    // ── Theme toggle ──
    themeToggle: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: radius.md,
      padding: 3,
      gap: 2,
    },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.sm,
    },
    themeOptionActive: {
      backgroundColor: colors.surface,
      ...shadow.sm,
    },
    themeOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textTertiary,
    },
    themeOptionTextActive: {
      color: colors.primary,
    },
    // ── Logout ──
    logoutButton: {
      borderRadius: radius.full,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
      backgroundColor: colors.dangerLight,
      borderWidth: 1.5,
      borderColor: colors.danger,
    },
    logoutButtonText: {
      fontSize: 16,
      fontFamily: 'RobotoMono_700Bold',
      color: '#d47070',
    },
  });
}
