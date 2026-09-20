import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { layout } from '../theme';
import { IconButton } from './IconButton';

interface FormHeaderProps {
  /** Omitted where the screen has no title yet — a group that is still loading. */
  title?: string;
  onBack: () => void;
}

// The mockup draws the back chevron at y=56 under a 54pt status bar, then the
// title at y=112. Flow layout keeps both gaps and swaps the status bar for the
// real inset. The chevron sits at left 12: its 52pt target already carries 15pt
// of air either side of the glyph, so it hangs back into the 20pt screen padding.
const BACK_TOP_GAP = 56 - 54;
const TITLE_TOP_GAP = 112 - (56 + 44);
const BACK_LEFT = 12;

export function FormHeader({ title, onBack }: FormHeaderProps) {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top + BACK_TOP_GAP, paddingHorizontal: layout.screenPad }}>
      <View style={styles.back}>
        <IconButton name="chevron-left" color={colors.text} onPress={onBack} accessibilityLabel="Back" />
      </View>
      {title ? (
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={1.3}
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
    marginLeft: BACK_LEFT - layout.screenPad,
  },
  title: {
    marginTop: TITLE_TOP_GAP,
    fontFamily: 'Geist_600SemiBold',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.22, // −0.01em at 22pt; React Native takes points
    includeFontPadding: false,
  },
});
