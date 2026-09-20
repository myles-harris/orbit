import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { layout, radius } from '../theme';

interface BottomActionBarProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** e.g. "Change a field to save" under an inert "Save changes" button. */
  caption?: string;
}

export function BottomActionBar({ label, onPress, disabled, caption }: BottomActionBarProps) {
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.hairline,
          paddingBottom: Math.max(insets.bottom, layout.barTopPad),
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
        style={[
          styles.button,
          {
            // Inert state is a distinct fill/text pair, not opacity on the
            // marigold/espresso pair — WCAG 1.4.3 exempts inactive controls
            // down to 3:1, and this pairing clears it (00-CONTEXT.md AC-11).
            // The 3.78:1 dark / 4.50:1 light figures in AC-11 are measured with
            // the track over `background`, which is why the bar is filled with it.
            backgroundColor: disabled ? colors.controlTrack : colors.accent,
          },
        ]}
      >
        <Text
          style={[
            styles.buttonLabel,
            { color: disabled ? colors.textSecondary : colors.onAccent },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
      {caption ? <Text style={[styles.caption, { color: colors.textSecondary }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: layout.barTopPad,
    paddingHorizontal: layout.screenPad,
    gap: 8,
  },
  button: {
    minHeight: layout.primaryBtn,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 17,
  },
  caption: {
    fontFamily: 'Geist_400Regular',
    fontSize: 12.5,
    textAlign: 'center',
  },
});
