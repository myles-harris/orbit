import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { parseApiError } from '@orbit/shared';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { useGroupPhoto } from '../utils/useGroupPhoto';
import { withAlpha } from '../utils/color';
import { radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Display } from './Display';
import { Icon } from './Icon';

const THUMB_SIZE = 88;
const BADGE_SIZE = 32;
const BADGE_RING = 2;
const BADGE_OFFSET = -6;

// One square source covers both places the photo is drawn: a tile is 522px at 3× and
// the 390pt detail header 1170px, so 1080 is what a cover-crop of either needs.
const PHOTO_MAX_EDGE = 1080;
const PHOTO_JPEG_QUALITY = 0.8;

interface GroupPhotoPickerProps {
  groupId: string;
  /** Its first letter is the fallback while the group has no photo. */
  name: string;
  /** Only the owner sets, replaces or removes the photo; everyone else just sees it. */
  editable: boolean;
  hasPhoto: boolean;
  photoUpdatedAt: string | null;
  /** The group's photo state after an upload or removal has succeeded on the server. */
  onChange: (next: { hasPhoto: boolean; photoUpdatedAt: string | null }) => void;
}

// The group's photo, or — until it has one — the `surface` fill with its initial, the
// way an avatar falls back. For the owner the whole thumb is a button, and its marigold
// camera badge says so.
export function GroupPhotoPicker({ groupId, name, editable, hasPhoto, photoUpdatedAt, onChange }: GroupPhotoPickerProps) {
  const { theme: { colors } } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const photo = useGroupPhoto({ groupId, hasPhoto, photoUpdatedAt });
  // The picked file, shown the moment it is chosen: identical bytes to what is uploaded,
  // so it cannot desync. Cleared only on failure or removal.
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The chosen picture, or null when the owner cancels, declines the permission, or the
  // picker cannot be shown — the last two already reported. It has its own catch because
  // nothing awaits the press handler: a rejection here would be an unhandled promise,
  // and the owner would get no word that nothing happened.
  const pickPhoto = async () => {
    try {
      // iOS: with allowsEditing: true, expo-image-picker uses UIImagePickerController, which
      // has needed no photo-library authorization since iOS 11. Requesting it anyway calls
      // PHPhotoLibrary.requestAuthorization(.readWrite) — which hard-crashes without
      // NSPhotoLibraryUsageDescription and, with it, adds a prompt users can deny themselves
      // out of a flow that would have worked. Android < 13 does need the storage permissions;
      // Android 13+ resolves to an empty permission set.
      if (Platform.OS === 'android') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Allow access to your photo library to set a group photo.');
          return null;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,     // no lossy pass here; the manipulator performs the single re-encode
        base64: false,  // never base64-encode the full-resolution asset
      });
      if (result.canceled) return null;

      const asset = result.assets[0];
      return asset?.uri ? asset : null;
    } catch (error) {
      console.error('[group-photo-pick] failed:', error);
      Alert.alert('Error', photoErrorMessage(error));
      return null;
    }
  };

  const pickAndUpload = async () => {
    const asset = await pickPhoto();
    if (!asset) return;

    setBusy(true);
    try {
      // Never upscale — a picture already smaller than the target is left at its own size.
      const targetWidth = Math.min(PHOTO_MAX_EDGE, asset.width || PHOTO_MAX_EDGE);

      // Omitting `height` preserves aspect ratio. The crop UI yields 1:1; if a platform
      // ever returns a non-square asset, `cover` handles it without distortion.
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize({ width: targetWidth });
      const rendered = await context.renderAsync();
      const image = await rendered.saveAsync({
        compress: PHOTO_JPEG_QUALITY,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!image.base64) throw new Error('encode_failed');

      setLocalUri(image.uri);

      const client = await createAuthenticatedApiClient();
      const { photo_updated_at } = await client.uploadGroupPhoto(groupId, image.base64, 'image/jpeg');
      onChange({ hasPhoto: true, photoUpdatedAt: photo_updated_at });
    } catch (error) {
      console.error('[group-photo-upload] failed:', error);
      setLocalUri(null);
      Alert.alert('Error', photoErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    try {
      const client = await createAuthenticatedApiClient();
      await client.deleteGroupPhoto(groupId);
      setLocalUri(null);
      onChange({ hasPhoto: false, photoUpdatedAt: null });
    } catch (error) {
      console.error('[group-photo-delete] failed:', error);
      Alert.alert('Error', photoErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handlePress = () => {
    if (!hasPhoto && !localUri) {
      void pickAndUpload();
      return;
    }
    Alert.alert('Group Photo', undefined, [
      { text: 'Choose new photo', onPress: () => void pickAndUpload() },
      { text: 'Remove photo', style: 'destructive', onPress: () => void removePhoto() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const thumb = (
    <>
      <View style={styles.thumb}>
        {localUri ? (
          <Image source={{ uri: localUri }} resizeMode="cover" style={styles.image} />
        ) : photo ? (
          <Image
            key={photo.imageKey}
            source={photo.source}
            onError={photo.onError}
            resizeMode="cover"
            style={styles.image}
          />
        ) : (
          <Display size={26} color={colors.textMeta}>{name.trim().charAt(0)}</Display>
        )}
        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.text} size="small" />
          </View>
        )}
      </View>
      {editable && (
        <View style={styles.badge}>
          <Icon name="camera" size={16} color={colors.onAccent} />
        </View>
      )}
    </>
  );

  if (!editable) return <View style={styles.thumbWrap}>{thumb}</View>;

  return (
    <TouchableOpacity
      onPress={handlePress}
      // A second press mid-upload would start a second upload alongside it.
      disabled={busy}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Change group photo"
      style={styles.thumbWrap}
    >
      {thumb}
    </TouchableOpacity>
  );
}

function photoErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'encode_failed') {
    return "Orbit couldn't process that photo. Try a different one.";
  }
  return parseApiError(error);
}

function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors']) {
  return StyleSheet.create({
    thumbWrap: { width: THUMB_SIZE, height: THUMB_SIZE },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: radius.xxl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      // Android clips a radius'd child inconsistently unless the parent clips too.
      overflow: 'hidden',
    },
    image: { width: '100%', height: '100%', borderRadius: radius.xxl },
    busy: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(colors.background, 0.7),
    },
    // A 32pt marigold disc inside a 2pt ring the colour of the page, so it reads
    // as cut out of the thumb's corner.
    badge: {
      position: 'absolute',
      right: BADGE_OFFSET,
      bottom: BADGE_OFFSET,
      width: BADGE_SIZE + BADGE_RING * 2,
      height: BADGE_SIZE + BADGE_RING * 2,
      borderRadius: radius.full,
      backgroundColor: colors.accent,
      borderWidth: BADGE_RING,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
