import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { radius } from '../theme';

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

// The one segmented control — Group Settings and Create Group both draw their
// cadence choice from here. A `controlTrack` well with 3pt of padding; the active
// item is a `surface` pill lifted by `shadow.card`. Both items are minHeight, not
// height, so large system text grows the control instead of clipping the label.
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { theme: { colors, shadow } } = useTheme();

  return (
    <View accessibilityRole="tablist" style={[styles.track, { backgroundColor: colors.controlTrack }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.item, active && { backgroundColor: colors.surface, ...shadow.card }]}
          >
            <Text
              style={[
                styles.label,
                // Both labels are `text`: `textSecondary` on the `controlTrack` well is
                // 3.78:1 in dark, and an unselected segment is still operable, so the
                // inactive-control exemption doesn't apply. The pill and the weight
                // carry the selection.
                { color: colors.text, fontFamily: active ? 'Geist_600SemiBold' : 'Geist_500Medium' },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.lg,
  },
  item: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  label: {
    fontSize: 15,
  },
});
