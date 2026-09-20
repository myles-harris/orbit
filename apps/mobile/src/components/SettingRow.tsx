import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout, radius } from '../theme';
import { Icon } from './Icon';

type SettingRowVariant =
  | { type: 'value'; value: string }
  | { type: 'toggle'; value: boolean; onToggle: (next: boolean) => void }
  | { type: 'chevron' }
  | { type: 'menu'; value: string };

interface SettingRowProps {
  label: string;
  variant: SettingRowVariant;
  onPress?: () => void;
  danger?: boolean;
}

// The hairline-separated row shared by Group Settings, Create Group, and
// Account. The row heights are minHeights, not heights, so 150%/200% system
// text grows the row instead of clipping it. The design draws toggle rows at 60.
export function SettingRow({ label, variant, onPress, danger }: SettingRowProps) {
  const { theme: { colors } } = useTheme();
  const minHeight = variant.type === 'toggle' ? layout.toggleRowHeight : layout.rowHeight;

  const content = (
    <View style={[styles.row, { borderBottomColor: colors.hairline, minHeight }]}>
      <Text style={[styles.label, { color: danger ? colors.danger : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      <RowControl variant={variant} />
    </View>
  );

  // A toggle row can still take onPress (e.g. to log the row being tapped, or
  // navigate to a detail screen) — the knob's own TouchableOpacity nests inside
  // and still handles its own tap independently.
  if (!onPress) return content;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}

function RowControl({ variant }: { variant: SettingRowVariant }) {
  const { theme: { colors } } = useTheme();
  switch (variant.type) {
    case 'value':
      return <Text style={[styles.value, { color: colors.textSecondary }]}>{variant.value}</Text>;
    case 'menu':
      return (
        <View style={styles.menuControl}>
          <Text style={[styles.value, { color: colors.textSecondary }]}>{variant.value}</Text>
          <Icon name="chevron-right" size={18} color={colors.textSecondary} />
        </View>
      );
    case 'chevron':
      return <Icon name="chevron-right" size={18} color={colors.textSecondary} />;
    case 'toggle':
      return <Toggle value={variant.value} onToggle={variant.onToggle} />;
  }
}

// Hand-rolled rather than RN's `Switch`: the native control's size and shape
// differ between iOS and Android, which breaks the one property (colors.*
// resolved consistently everywhere) that makes the re-skin tractable.
const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const KNOB_SIZE = 27;
const KNOB_INSET = 2;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB_SIZE - KNOB_INSET * 2;

function Toggle({ value, onToggle }: { value: boolean; onToggle: (next: boolean) => void }) {
  const { theme: { colors } } = useTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [value, anim]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, KNOB_TRAVEL] });

  return (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      activeOpacity={0.85}
      style={[
        styles.track,
        { backgroundColor: value ? colors.accent : colors.toggleTrack },
      ]}
    >
      <Animated.View
        style={[
          styles.knob,
          { backgroundColor: value ? colors.onAccent : colors.surface, transform: [{ translateX }] },
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    flex: 1,
    fontFamily: 'Gelasio_400Regular',
    fontSize: 17,
  },
  value: {
    fontFamily: 'Geist_500Medium',
    fontSize: 16,
  },
  menuControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    padding: KNOB_INSET,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: radius.full,
  },
});
