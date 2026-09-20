import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout, radius } from '../theme';
import { Icon } from './Icon';

interface OfflineBannerProps {
  /** When the copy on screen was fetched, already formatted — "9:41 AM". */
  savedAt: string;
  onRetry: () => void;
  /** A retry is in flight: the button goes inert instead of queueing another. */
  busy?: boolean;
}

/**
 * Says the groups on screen are a saved copy, and from when. Neutral on purpose — no
 * marigold, no danger colour: nothing is broken, something is just not live, and the
 * design's intent is to dim rather than alarm.
 */
export function OfflineBanner({ savedAt, onRetry, busy = false }: OfflineBannerProps) {
  const { theme: { colors } } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.hairline }]}
    >
      <Icon name="wifi-off" size={20} color={colors.textSecondary} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>No connection</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>Showing groups saved at {savedAt}</Text>
      </View>
      <TouchableOpacity
        onPress={onRetry}
        disabled={busy}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        style={[styles.retry, { borderColor: colors.borderStrong, opacity: busy ? 0.5 : 1 }]}
      >
        <Text style={[styles.retryLabel, { color: colors.text }]}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// Heights are minHeights: at 150–200% system text the banner grows with its copy
// instead of the two lines spilling over the Retry button.
const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: layout.gridPad,
    // Appendix B: the banner sits 4pt under the header, and the filter row 14pt under it.
    marginTop: 4,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 14.5,
  },
  sub: {
    fontFamily: 'Gelasio_400Regular',
    fontSize: 13.5,
  },
  retry: {
    minHeight: layout.touchMin,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  retryLabel: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 14.5,
  },
});
