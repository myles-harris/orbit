import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { GroupDTO } from '@orbit/shared';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface Invitation {
  id: string;
  group: {
    id: string;
    name: string;
    cadence: string;
    weekly_frequency: number | null;
    call_duration_minutes: number;
    member_count: number;
  };
  invited_by: string;
}

type FilterTab = 'All' | 'Daily' | 'Weekly' | 'Invited';
const FILTER_TABS: FilterTab[] = ['All', 'Daily', 'Weekly', 'Invited'];

const GAP = 8;
const CARD_HEIGHT = 150;

function getCadenceLabel(cadence: string, weekly_frequency?: number | null) {
  if (cadence === 'daily') return 'Daily';
  if (weekly_frequency) return `${weekly_frequency}×/wk`;
  return 'Weekly';
}

// ─── GroupTile ────────────────────────────────────────────────────────────────

interface GroupTileProps {
  name: string;
  cadenceLabel: string;
  memberCount: number;
  isMuted?: boolean;
  colors: any;
  onPress: () => void;
}

// Flat surface + hairline — the no-photo tile treatment. The per-group hashed
// colour system this replaced is retired; group photos are the real identity
// signal now (see 00-CONTEXT.md, "Group photos").
function GroupTile({ name, cadenceLabel, memberCount, isMuted, colors, onPress }: GroupTileProps) {
  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, height: CARD_HEIGHT }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={cardStyles.cardTop}>
        <View style={[cardStyles.pill, { backgroundColor: colors.background }]}>
          <Text style={[cardStyles.pillText, { color: colors.textSecondary }]}>{cadenceLabel}</Text>
        </View>
        {isMuted && (
          <View style={[cardStyles.pill, { backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 5 }]}>
            <Ionicons name="volume-mute" size={13} color={colors.textSecondary} />
          </View>
        )}
      </View>
      <View style={cardStyles.cardBottom}>
        <Text style={[cardStyles.cardName, { color: colors.text }]} numberOfLines={2}>{name}</Text>
        <Text style={[cardStyles.cardMeta, { color: colors.textTertiary }]}>
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── PendingTile ──────────────────────────────────────────────────────────────

interface PendingTileProps {
  name: string;
  cadenceLabel: string;
  memberCount: number;
  colors: any;
  onPress: () => void;
}

function PendingTile({ name, cadenceLabel, memberCount, colors, onPress }: PendingTileProps) {
  return (
    <TouchableOpacity
      style={[cardStyles.card, cardStyles.pendingCard, { backgroundColor: colors.surface, height: CARD_HEIGHT, borderColor: colors.hairline }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={cardStyles.cardTop}>
        <View style={[cardStyles.pill, { backgroundColor: colors.background }]}>
          <Text style={[cardStyles.pillText, { color: colors.textSecondary, opacity: 0.7 }]}>{cadenceLabel}</Text>
        </View>
        <View style={[cardStyles.pill, { backgroundColor: colors.background }]}>
          <Text style={[cardStyles.pillText, { color: colors.textSecondary, opacity: 0.8 }]}>Pending</Text>
        </View>
      </View>
      <View style={[cardStyles.cardBottom, { opacity: 0.65 }]}>
        <Text style={[cardStyles.cardName, { color: colors.text }]} numberOfLines={2}>{name}</Text>
        <Text style={[cardStyles.cardMeta, { color: colors.textTertiary }]}>
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── GroupGrid ──────────────────────────────────────────────────────────────

interface GridItem { type: 'group'; data: GroupDTO; }
interface PendingGridItem { type: 'pending'; data: Invitation; }
type AnyGridItem = GridItem | PendingGridItem;

interface GroupGridProps {
  items: AnyGridItem[];
  colors: any;
  onPressGroup: (groupId: string) => void;
  onPressInvitation: (invitationId: string) => void;
}

function GroupGrid({ items, colors, onPressGroup, onPressInvitation }: GroupGridProps) {
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);

  const renderItem = (item: AnyGridItem, key: string) => {
    if (item.type === 'group') {
      const g = item.data;
      return (
        <GroupTile
          key={key}
          name={g.name}
          cadenceLabel={getCadenceLabel(g.cadence, g.weekly_frequency)}
          memberCount={g.member_count}
          isMuted={g.is_muted}
          colors={colors}
          onPress={() => onPressGroup(g.id)}
        />
      );
    }
    const inv = item.data;
    return (
      <PendingTile
        key={key}
        name={inv.group.name}
        cadenceLabel={getCadenceLabel(inv.group.cadence, inv.group.weekly_frequency)}
        memberCount={inv.group.member_count}
        colors={colors}
        onPress={() => onPressInvitation(inv.id)}
      />
    );
  };

  return (
    <View style={{ flexDirection: 'row', gap: GAP }}>
      <View style={{ flex: 1, gap: GAP }}>
        {left.map((item, i) =>
          renderItem(item, item.type === 'group' ? item.data.id : `inv-${item.data.id}-${i}`)
        )}
      </View>
      <View style={{ flex: 1, gap: GAP }}>
        {right.map((item, i) =>
          renderItem(item, item.type === 'group' ? item.data.id : `inv-${item.data.id}-${i}`)
        )}
      </View>
    </View>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { theme: { colors, shadow } } = useTheme();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [loadError, setLoadError] = useState<string | null>(null);

  const styles = useMemo(() => makeStyles(colors, shadow), [colors]);

  const loadData = async () => {
    setLoadError(null);
    try {
      const client = await createAuthenticatedApiClient();
      const [groupsRes, invitationsRes] = await Promise.all([
        client.get<{ groups: GroupDTO[] }>('/groups'),
        client.getMyInvitations(),
      ]);
      setGroups(groupsRes.groups);
      setInvitations(invitationsRes.invitations);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoadError("Couldn't load your groups. Pull down to retry.");
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Stands in for the now-deleted dedicated invite-response screen until
  // PR 3 gives the invite row its own inline Accept/Later actions.
  const onPressInvitation = (invitationId: string) => {
    const invitation = invitations.find((inv) => inv.id === invitationId);
    if (!invitation) return;
    Alert.alert(`Join ${invitation.group.name}?`, `Invited by ${invitation.invited_by}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => respondToInvitation(invitation, 'decline') },
      { text: 'Accept', onPress: () => respondToInvitation(invitation, 'accept') },
    ]);
  };

  const respondToInvitation = async (invitation: Invitation, action: 'accept' | 'decline') => {
    try {
      const client = await createAuthenticatedApiClient();
      const result = await client.respondToInvitation(invitation.id, action);
      // Same confirmations the deleted InvitationsScreen showed.
      if (action === 'accept') {
        Alert.alert('Joined!', `You joined ${result.group?.name ?? invitation.group.name}!`);
      } else {
        Alert.alert('Declined', 'Invitation declined');
      }
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to respond to invitation');
    }
  };

  const gridItems: AnyGridItem[] = (() => {
    if (activeFilter === 'Invited') {
      return invitations.map((inv) => ({ type: 'pending' as const, data: inv }));
    }
    const filtered = groups.filter((g) => {
      if (activeFilter === 'Daily') return g.cadence === 'daily';
      if (activeFilter === 'Weekly') return g.cadence === 'weekly';
      return true;
    });
    return filtered.map((g) => ({ type: 'group' as const, data: g }));
  })();

  const isEmpty = gridItems.length === 0;
  const emptyIcon =
    activeFilter === 'Invited'
      ? <Ionicons name="mail-outline" size={48} color={colors.textTertiary} />
      : <Ionicons name="ellipse-outline" size={48} color={colors.textTertiary} />;
  const emptyMessage =
    activeFilter === 'Invited'
      ? { title: 'No pending invitations', sub: "You're all caught up" }
      : activeFilter !== 'All'
      ? { title: `No ${activeFilter.toLowerCase()} groups`, sub: 'Switch filters to see your groups' }
      : { title: 'No groups yet', sub: 'Tap + to create your first group' };

  return (
    <View style={styles.container}>
      {/* Minimal stand-in for the designed header/avatar (PR 3) — without this,
          deleting the Settings tab in this PR would leave Account (and Log Out)
          completely unreachable. */}
      <View style={[styles.headerRow, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.headerTitle}>Groups</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Account')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="person-circle-outline" size={30} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab;
          const showBadge = tab === 'Invited' && invitations.length > 0;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setActiveFilter(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {tab}
              </Text>
              {showBadge && (
                <View style={[styles.filterBadge, isActive && styles.filterBadgeActive]}>
                  <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                    {invitations.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loadError && isEmpty ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="cloud-offline-outline" size={48} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>Couldn't load groups</Text>
            <Text style={styles.emptySubtitle}>{loadError}</Text>
          </View>
        ) : isEmpty ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconContainer}>{emptyIcon}</View>
            <Text style={styles.emptyTitle}>{emptyMessage.title}</Text>
            <Text style={styles.emptySubtitle}>{emptyMessage.sub}</Text>
          </View>
        ) : (
          <GroupGrid
            items={gridItems}
            colors={colors}
            onPressGroup={(groupId) => navigation.navigate('GroupDetail', { groupId })}
            onPressInvitation={onPressInvitation}
          />
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: spacing.xxxl + insets.bottom }]}
        onPress={() => navigation.navigate('CreateGroup')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.textOnPrimary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Static card styles ───────────────────────────────────────────────────────
const cardStyles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  pendingCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cardBottom: { gap: 4 },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  cardMeta: {
    fontSize: 13,
    fontWeight: '500',
  },
});

// ─── Themed styles ────────────────────────────────────────────────────────────
function makeStyles(colors: any, shadow: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    filterRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.background,
    },
    filterPillActive: { backgroundColor: colors.text },
    filterPillText: {
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.1,
      color: colors.textSecondary,
    },
    filterPillTextActive: { color: colors.background },
    filterBadge: {
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      minWidth: 16,
      height: 16,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    filterBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
    filterBadgeText: { fontSize: 9, fontWeight: '700', color: colors.textOnPrimary },
    // On the active pill (colors.text fill), not the marigold badge — same
    // inversion filterPillTextActive uses.
    filterBadgeTextActive: { color: colors.background },
    scrollContent: { padding: GAP, paddingBottom: 100 },
    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl },
    emptyIconContainer: { marginBottom: spacing.lg },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: 'center',
      lineHeight: 20,
    },
    fab: {
      position: 'absolute',
      right: spacing.xl,
      bottom: 32,
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      ...shadow.menu,
    },
  });
}
