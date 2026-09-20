import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { UserDTO, parseApiError } from '@orbit/shared';
import { useAuth } from '../context/AuthContext';
import { useTutorial } from '../context/TutorialContext';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { layout, radius, spacing, type AppTheme } from '../theme';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import { UserAvatar } from '../components/UserAvatar';
import { Display } from '../components/Display';
import { Icon } from '../components/Icon';
import { SettingRow } from '../components/SettingRow';
import { syncCallChannel } from '../utils/notificationChannels';
import { withAlpha } from '../utils/color';

// Vertical rhythm, from the mockup's absolute offsets: the title sits 12pt under
// the status bar (66 − 54), the avatar row 22pt under the title (116 − (66 + 28)),
// and each section header 38pt under whatever precedes it.
const TITLE_TOP_GAP = 66 - 54;
const PROFILE_TOP_GAP = 116 - (66 + 28);
const SECTION_GAP = 38;
const MENU_GAP = 8;

// Dark first in both modes — the order is part of the design, not a reflection of
// which one is selected.
const MODE_OPTIONS: { mode: ThemeMode; label: string; icon: 'moon' | 'sun' }[] = [
  { mode: 'dark', label: 'Dark', icon: 'moon' },
  { mode: 'light', label: 'Light', icon: 'sun' },
];

type Colors = AppTheme['colors'];

/** The trigger's rectangle in window coordinates, which is where the menu is placed. */
interface Anchor { x: number; y: number; width: number; height: number }

export default function AccountScreen() {
  const { onLogout } = useAuth();
  const { showTutorial } = useTutorial();
  const { theme: { colors, shadow }, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notifySound, setNotifySound] = useState(true);
  const [notifyVibrate, setNotifyVibrate] = useState(true);
  const [notifyBreakFocus, setNotifyBreakFocus] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<View>(null);

  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);

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

  // The menu is positioned from where the trigger actually is, so it lands right
  // whatever the row above it did to the layout (larger text, a longer name).
  const openThemeMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
    });
  };
  const closeThemeMenu = () => setMenuAnchor(null);
  const chooseMode = (next: ThemeMode) => {
    if (next !== mode) setMode(next);
    closeThemeMenu();
  };

  if (!user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.textSecondary} />
      </View>
    );
  }

  const currentOption = MODE_OPTIONS.find(o => o.mode === mode)!;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + TITLE_TOP_GAP }]}
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>Account</Text>

        <View style={styles.profile}>
          <TouchableOpacity
            onPress={handleAvatarPress}
            // A second press mid-upload would start a second upload alongside it.
            disabled={uploadingAvatar}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={styles.avatarWrapper}
          >
            <UserAvatar
              userId={user.id}
              username={user.username}
              hasAvatar={user.has_avatar}
              size={68}
              colors={colors}
              avatarUpdatedAt={user.avatar_updated_at}
              previewUri={localAvatarUri}
            />
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.text} size="small" />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Icon name="camera" size={12} color={colors.onAccent} />
            </View>
          </TouchableOpacity>
          <View style={styles.identity}>
            <Display size={26} leading={1.1} numberOfLines={1}>{user.username}</Display>
            <Text style={styles.phone}>{user.phone}</Text>
            <Text style={styles.timezone}>{user.time_zone}</Text>
          </View>
        </View>

        <Text accessibilityRole="header" style={styles.sectionHeader}>Notifications</Text>
        <View style={styles.group}>
          <SettingRow
            label="Chime when a call starts"
            variant={{ type: 'toggle', value: notifySound, onToggle: onToggleSound }}
          />
          <SettingRow
            label="Vibrate when a call starts"
            variant={{ type: 'toggle', value: notifyVibrate, onToggle: onToggleVibrate }}
          />
          <SettingRow
            label={Platform.OS === 'ios' ? 'Let calls through Focus' : 'Let calls through Do Not Disturb'}
            variant={{ type: 'toggle', value: notifyBreakFocus, onToggle: onToggleBreakFocus }}
          />
        </View>

        <Text accessibilityRole="header" style={styles.sectionHeader}>Appearance</Text>
        <View style={styles.group}>
          <SettingRow
            label="Theme"
            variant={{
              type: 'control',
              control: (
                // Measured for the menu's position. `collapsable={false}` keeps Android from
                // flattening the wrapper away, which would leave nothing to measure.
                <View ref={triggerRef} collapsable={false}>
                  <TouchableOpacity
                    onPress={openThemeMenu}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Theme, ${currentOption.label}`}
                    accessibilityHint="Opens the theme menu"
                    accessibilityState={{ expanded: menuAnchor !== null }}
                    style={styles.themeTrigger}
                  >
                    {/* The one icon stroke marigold gets: the moon, in dark mode only. */}
                    <Icon name={currentOption.icon} size={15} color={mode === 'dark' ? colors.accent : colors.text} />
                    {/* The pill is a fixed 40pt, so its label is capped rather than left to grow out of it. */}
                    <Text style={styles.themeTriggerLabel} maxFontSizeMultiplier={1.3}>{currentOption.label}</Text>
                    <Icon name="chevron-up" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ),
            }}
          />
        </View>

        {/* The tutorial's only way back in once first-run has passed, so it stays even
            though the mockup draws no row for it. */}
        <Text accessibilityRole="header" style={styles.sectionHeader}>About</Text>
        <View style={styles.group}>
          <SettingRow label="How it works" variant={{ type: 'chevron' }} onPress={showTutorial} />
        </View>

        <Text style={styles.version}>Orbit 0.1.0</Text>
      </ScrollView>

      {/* Not BottomActionBar's secondary variant: the design letters Log out in the quieter
          textMeta (that variant uses `text`) and draws no rule above this bar. */}
      <View style={[styles.logoutBar, { paddingBottom: Math.max(insets.bottom, layout.barTopPad) }]}>
        <TouchableOpacity
          onPress={logout}
          activeOpacity={0.75}
          accessibilityRole="button"
          style={styles.logoutButton}
        >
          <Text style={styles.logoutLabel}>Log out</Text>
        </TouchableOpacity>
      </View>

      <ThemeMenu
        anchor={menuAnchor}
        mode={mode}
        colors={colors}
        styles={styles}
        onSelect={chooseMode}
        onClose={closeThemeMenu}
      />
    </View>
  );
}

// A Modal rather than an absolutely-positioned sibling: Android clips children that
// escape their parent's bounds and treats zIndex unreliably, so an in-tree menu
// would be cut off by the row that owns it. A Modal overlays on both platforms and
// nothing beneath it moves. `statusBarTranslucent` puts Android's Modal window on
// the same origin as measureInWindow's coordinates.
function ThemeMenu({
  anchor, mode, colors, styles, onSelect, onClose,
}: {
  anchor: Anchor | null;
  mode: ThemeMode;
  colors: Colors;
  styles: ReturnType<typeof makeStyles>;
  onSelect: (mode: ThemeMode) => void;
  onClose: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();

  return (
    <Modal
      visible={anchor !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dismisses without choosing: the theme only changes on a row press. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close theme menu"
      />
      {anchor && (
        <View
          // Right-aligned to the trigger, 8pt beneath it.
          style={[styles.menu, { top: anchor.y + anchor.height + MENU_GAP, right: windowWidth - (anchor.x + anchor.width) }]}
        >
          <View style={styles.menuClip}>
            {MODE_OPTIONS.map((option, index) => {
              const selected = option.mode === mode;
              return (
                <TouchableOpacity
                  key={option.mode}
                  onPress={() => onSelect(option.mode)}
                  activeOpacity={0.7}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  style={[
                    styles.menuRow,
                    index < MODE_OPTIONS.length - 1 && styles.menuRowDivider,
                    selected && styles.menuRowSelected,
                  ]}
                >
                  <Icon name={option.icon} size={15} color={colors.textSecondary} />
                  <Text style={[styles.menuLabel, selected && styles.menuLabelSelected]}>{option.label}</Text>
                  {selected && <Icon name="check" size={16} color={colors.text} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </Modal>
  );
}

function avatarErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'encode_failed') {
    return "Orbit couldn't process that photo. Try a different one.";
  }
  return parseApiError(error);
}

function makeStyles(colors: Colors, shadow: AppTheme['shadow']) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    content: { paddingHorizontal: layout.screenPad, paddingBottom: spacing.xxl },
    title: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.22, // −0.01em at 22pt; React Native takes points
      includeFontPadding: false,
      color: colors.text,
    },
    profile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginTop: PROFILE_TOP_GAP,
    },
    avatarWrapper: { position: 'relative' },
    avatarOverlay: {
      position: 'absolute',
      top: 0, right: 0, bottom: 0, left: 0,
      borderRadius: radius.full,
      backgroundColor: withAlpha(colors.background, 0.7),
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarEditBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 26,
      height: 26,
      borderRadius: radius.full,
      backgroundColor: colors.accent,
      borderWidth: 2,
      borderColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    identity: { flex: 1, minWidth: 0 },
    phone: {
      marginTop: 6,
      fontFamily: 'GeistMono_500Medium',
      fontSize: 13.5,
      includeFontPadding: false,
      color: colors.textMeta,
    },
    timezone: {
      marginTop: 3,
      fontFamily: 'Geist_400Regular',
      fontSize: 13.5,
      includeFontPadding: false,
      color: colors.textSecondary,
    },
    sectionHeader: {
      marginTop: SECTION_GAP,
      marginBottom: 10,
      fontFamily: 'Geist_600SemiBold',
      fontSize: 16,
      lineHeight: 20,
      includeFontPadding: false,
      color: colors.text,
    },
    // SettingRow draws the rule beneath each row; the group draws the one above the first.
    group: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    version: {
      marginTop: SECTION_GAP,
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12.5,
      includeFontPadding: false,
      color: colors.textSecondary,
    },
    // ── Theme trigger ──
    themeTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      height: 40,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    themeTriggerLabel: {
      fontFamily: 'Geist_500Medium',
      fontSize: 15,
      includeFontPadding: false,
      color: colors.text,
    },
    // ── Theme menu ──
    // The shadow and the clip are on separate views: overflow hidden would cut the
    // shadow off on iOS if they shared one.
    menu: {
      position: 'absolute',
      width: 186,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      ...shadow.menu,
    },
    menuClip: { borderRadius: radius.xl - 1, overflow: 'hidden' },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    menuRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    menuRowSelected: { backgroundColor: colors.accentSoft },
    menuLabel: {
      flex: 1,
      fontFamily: 'Geist_500Medium',
      fontSize: 15.5,
      includeFontPadding: false,
      color: colors.text,
    },
    menuLabelSelected: { fontFamily: 'Geist_600SemiBold' },
    // ── Log out ──
    logoutBar: {
      paddingTop: layout.barTopPad,
      paddingHorizontal: layout.screenPad,
    },
    logoutButton: {
      minHeight: layout.secondaryBtn,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoutLabel: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 16,
      includeFontPadding: false,
      color: colors.textMeta,
    },
  });
}
