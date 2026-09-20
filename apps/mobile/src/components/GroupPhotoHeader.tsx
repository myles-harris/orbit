import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { onPhoto, scrim } from '../theme';
import { useGroupPhoto } from '../utils/useGroupPhoto';
import { IconButton } from './IconButton';
import { LightStatusBar } from './LightStatusBar';

interface GroupPhotoHeaderProps {
  /**
   * The group, and — from `GroupDetailDTO` — whether it has a photo and when that
   * last changed. Without a photo the header is only its two glyphs. The header
   * fetches the image itself, with the token and retry `useGroupPhoto` carries.
   */
  groupId: string;
  hasPhoto?: boolean;
  photoUpdatedAt?: string | null;
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
// Without a photo the title follows the glyphs directly. 12pt is the gap a form
// screen leaves between its back chevron and its title (112 − (56 + 44)), so both
// kinds of screen start their titles at the same height.
const PLAIN_TITLE_GAP = 112 - (56 + 44);

// The header of Group Detail. With a photo it is full-bleed: the photo fades into
// the page, with back and settings glyphs over it. Without one there is nothing to
// fill 300pt with, so it is only the glyphs, on the page itself, and the title and
// everything under it move up into the space.
export function GroupPhotoHeader({ groupId, hasPhoto = false, photoUpdatedAt, onBack, onSettings }: GroupPhotoHeaderProps) {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  // Null covers a group with no photo, a token not yet in hand, and a load that failed
  // twice: all three take the plain header, the designed no-photo state.
  const photo = useGroupPhoto({ groupId, hasPhoto, photoUpdatedAt });
  const glyphsTop = insets.top + CHROME_TOP_GAP;

  if (!photo) {
    // The glyphs sit on the page background, so they take its text colour in both
    // themes, and the app's own theme-following status bar already suits it.
    return (
      <View
        style={[
          styles.glyphs,
          { marginTop: glyphsTop, marginHorizontal: CHROME_SIDE, marginBottom: PLAIN_TITLE_GAP },
        ]}
      >
        <Glyphs color={colors.text} onBack={onBack} onSettings={onSettings} />
      </View>
    );
  }

  return (
    <View style={styles.header}>
      {/* Cream glyphs and a light status bar belong over a dark photo, in either theme. */}
      <LightStatusBar />

      <View style={[styles.backdrop, { backgroundColor: colors.surface }]}>
        <Image
          key={photo.imageKey}
          source={photo.source}
          onError={photo.onError}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* Keeps the glyphs legible over the photo. */}
      <LinearGradient colors={scrim.detailHeader} style={styles.topScrim} />

      <LinearGradient colors={[colors.backgroundClear, colors.background] as const} style={styles.fade} />

      <View style={[styles.glyphs, styles.glyphsOverPhoto, { top: glyphsTop }]}>
        <Glyphs color={onPhoto.title} onBack={onBack} onSettings={onSettings} />
      </View>
    </View>
  );
}

function Glyphs({ color, onBack, onSettings }: { color: string; onBack: () => void; onSettings: () => void }) {
  return (
    <>
      <IconButton name="chevron-left" color={color} onPress={onBack} accessibilityLabel="Back" />
      <IconButton name="settings" color={color} onPress={onSettings} accessibilityLabel="Group settings" />
    </>
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
  glyphs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glyphsOverPhoto: {
    position: 'absolute',
    left: CHROME_SIDE,
    right: CHROME_SIDE,
  },
});
