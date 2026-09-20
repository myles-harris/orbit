import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout, radius } from '../theme';
import { Display } from './Display';

interface InvitationRowProps {
  groupName: string;
  invitedBy: string;
  /** Formatted upstream (e.g. "Daily", "3×/wk") — this component only places it. */
  cadence: string;
  /** A response is in flight; both actions are inert until it settles. */
  busy?: boolean;
  onAccept: () => void;
  onLater: () => void;
}

// The full-width, both-columns pending-invitation row. Marigold appears three ways
// here, all of them AC-3 roles: the 1px border, the `accentSoft` wash, and Accept —
// a fill carrying a label. Later is text-only so Accept is the row's one action.
export function InvitationRow({ groupName, invitedBy, cadence, busy, onAccept, onLater }: InvitationRowProps) {
  const { theme: { colors } } = useTheme();

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.accentSoft, borderColor: colors.accent, opacity: busy ? 0.6 : 1 },
      ]}
    >
      <View style={styles.text}>
        <Display size={18} numberOfLines={2}>
          {groupName}
        </Display>
        <Text numberOfLines={1} style={[styles.meta, { color: colors.textSecondary }]}>
          Invited by {invitedBy} · {cadence}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onLater}
        disabled={busy}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Decide later about ${groupName}`}
        style={styles.later}
      >
        <Text style={[styles.laterLabel, { color: colors.text }]}>Later</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onAccept}
        disabled={busy}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Accept invitation to ${groupName}`}
        style={[styles.accept, { backgroundColor: colors.accent }]}
      >
        <Text style={[styles.acceptLabel, { color: colors.onAccent }]}>Accept</Text>
      </TouchableOpacity>
    </View>
  );
}

// Both actions are minHeights: at 150–200% system text they grow with their label.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  meta: {
    fontFamily: 'Geist_400Regular',
    fontSize: 13,
  },
  later: {
    minHeight: layout.touchMin,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterLabel: {
    fontFamily: 'Geist_500Medium',
    fontSize: 15,
  },
  accept: {
    minHeight: layout.touchMin,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptLabel: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 15,
  },
});
