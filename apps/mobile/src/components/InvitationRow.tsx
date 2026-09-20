import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout, radius } from '../theme';
import { Display } from './Display';

interface InvitationRowProps {
  groupName: string;
  invitedBy: string;
  /** Formatted upstream (e.g. "Daily", "3×/wk") — this component only places it. */
  cadence: string;
  /** A response is in flight; every action is inert until it settles. */
  busy?: boolean;
  onAccept: () => void;
  onLater: () => void;
  /** Permanent — the caller is expected to confirm first. */
  onDecline: () => void;
}

// The full-width, both-columns pending-invitation row. Two rows inside: who and what
// on top, then the three answers — three buttons do not fit beside a group name at
// 375pt. Marigold appears three ways here, all AC-3 roles: the 1px border, the
// `accentSoft` wash, and Accept — a fill carrying a label. Decline and Later are
// text-only so Accept is the row's one filled action.
export function InvitationRow({ groupName, invitedBy, cadence, busy, onAccept, onLater, onDecline }: InvitationRowProps) {
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

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onDecline}
          disabled={busy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Decline invitation to ${groupName}`}
          style={styles.textAction}
        >
          <Text style={[styles.textActionLabel, { color: colors.textSecondary }]}>Decline</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onLater}
          disabled={busy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Decide later about ${groupName}`}
          style={styles.textAction}
        >
          <Text style={[styles.textActionLabel, { color: colors.text }]}>Later</Text>
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
    </View>
  );
}

// Every action is a minHeight: at 150–200% system text it grows with its label.
const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  text: {
    gap: 2,
  },
  meta: {
    fontFamily: 'Geist_400Regular',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  textAction: {
    minHeight: layout.touchMin,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textActionLabel: {
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
