import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout, radius } from '../theme';

interface FilterTabsProps<T extends string> {
  tabs: T[];
  active: T;
  onChange: (tab: T) => void;
  /**
   * Pending-invite count for the tab literally named "Invited". The chip is
   * conditional on the design: screen 02 draws "Invited 2", screens 03 and 06
   * draw "Invited" bare — so it renders only when the count is above zero.
   */
  invitedCount?: number;
}

export function FilterTabs<T extends string>({ tabs, active, onChange, invitedCount }: FilterTabsProps<T>) {
  const { theme: { colors } } = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: colors.hairline }]}>
      {tabs.map((tab) => {
        const isActive = tab === active;
        const showBadge = tab === 'Invited' && (invitedCount ?? 0) > 0;
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onChange(tab)}
            activeOpacity={0.7}
            style={styles.tab}
          >
            <View style={styles.tabLabelRow}>
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.text : colors.textSecondary,
                    fontFamily: isActive ? 'Geist_600SemiBold' : 'Geist_400Regular',
                  },
                ]}
              >
                {tab}
              </Text>
              {showBadge && (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.badgeText, { color: colors.onAccent }]}>{invitedCount}</Text>
                </View>
              )}
            </View>
            {/* A View, not textDecorationLine — RN ignores textDecorationColor on
                Android and offset entirely, so any marigold rule under text is a
                sibling border throughout this app. */}
            <View style={[styles.underline, isActive && { backgroundColor: colors.accent }]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// minHeight, not height: at 150–200% system text the row grows instead of the
// labels overflowing into the header above it.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 22,
    minHeight: layout.filterHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    alignItems: 'center',
    // Pulls the 2px rule down over the row's hairline so the active tab sits on
    // it, the way a CSS `border-bottom` with `margin-bottom: -1px` does.
    marginBottom: -StyleSheet.hairlineWidth,
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // The design's 10pt item padding sits between the label and the rule, not
    // under the rule — the underline is the last thing in the tab.
    paddingBottom: 10,
  },
  tabText: {
    fontSize: 15,
  },
  underline: {
    height: 2,
    width: '100%',
    backgroundColor: 'transparent',
  },
  badge: {
    borderRadius: radius.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 12,
  },
});
