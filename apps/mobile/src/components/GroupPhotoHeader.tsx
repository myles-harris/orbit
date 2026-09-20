import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { onPhoto, scrim } from '../theme';
import { IconButton } from './IconButton';
import { LightStatusBar } from './LightStatusBar';

interface GroupPhotoHeaderProps {
  /** Absent until a group has a photo — every group starts on the `surface` fill. */
  photoUri?: string | null;
  onBack: () => void;
  onSettings: () => void;
}

// Appendix B, measured from the top of the screen with the status bar included.
const PHOTO_HEIGHT = 288;
const SCRIM_HEIGHT = 112;
const FADE_START = 208;
const FADE_END = 300;
// The title starts at 296, four points inside the fade. The header takes 300 of
// vertical space and hands the last four back, so the title just follows it.
const TITLE_TOP = 296;
// Buttons sit at y=56 under a 54pt status bar.
const CHROME_TOP_GAP = 56 - 54;
const CHROME_SIDE = 12;

// The full-bleed header of Group Detail: a photo (or a `surface` fill) that fades
// into the page, with back and settings glyphs over it.
export function GroupPhotoHeader({ photoUri, onBack, onSettings }: GroupPhotoHeaderProps) {
  const { theme: { colors }, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const hasPhoto = !!photoUri;

  // Cream chrome and a light status bar belong over something dark: a photo, or the
  // dark theme's surface. On the light theme's white surface cream is ~1.05:1, so
  // the glyphs are `text` there and the status bar follows the app's own.
  const overDark = hasPhoto || mode === 'dark';
  const chrome = overDark ? onPhoto.title : colors.text;

  return (
    <View style={styles.header}>
      {overDark ? <LightStatusBar /> : null}

      <View style={[styles.backdrop, { backgroundColor: colors.surface }]}>
        {hasPhoto ? <Image source={{ uri: photoUri! }} resizeMode="cover" style={StyleSheet.absoluteFillObject} /> : null}
      </View>

      {/* The scrim exists to keep the glyphs legible over a photo; over a plain
          surface it would only smudge it. */}
      {hasPhoto ? <LinearGradient colors={scrim.detailHeader} style={styles.topScrim} /> : null}

      <LinearGradient colors={[colors.backgroundClear, colors.background] as const} style={styles.fade} />

      <View style={[styles.chrome, { top: insets.top + CHROME_TOP_GAP }]}>
        <IconButton name="chevron-left" color={chrome} onPress={onBack} accessibilityLabel="Back" />
        <IconButton name="settings" color={chrome} onPress={onSettings} accessibilityLabel="Group settings" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: FADE_END,
    marginBottom: TITLE_TOP - FADE_END,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PHOTO_HEIGHT,
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCRIM_HEIGHT,
  },
  fade: {
    position: 'absolute',
    top: FADE_START,
    left: 0,
    right: 0,
    height: FADE_END - FADE_START,
  },
  chrome: {
    position: 'absolute',
    left: CHROME_SIDE,
    right: CHROME_SIDE,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
