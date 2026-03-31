import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { GroupDTO } from '@orbit/shared';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { getGroupColorIndices, defaultPaletteIndex, CARD_PALETTES } from '../utils/groupColors';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Main'>;

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



function getCardHeight(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 17 + name.charCodeAt(i)) & 0xffff;
  }
  return 120 + (hash % 80);
}

function getCadenceLabel(cadence: string, weekly_frequency?: number | null) {
  if (cadence === 'daily') return 'Daily';
  if (weekly_frequency) return `${weekly_frequency}×/wk`;
  return 'Weekly';
}

// ─── BentoCard ────────────────────────────────────────────────────────────────

interface BentoCardProps {
  name: string;
  cadenceLabel: string;
  memberCount: number;
  isMuted?: boolean;
  paletteIndex: number;
  onPress: () => void;
}

function BentoCard({ name, cadenceLabel, memberCount, isMuted, paletteIndex, onPress }: BentoCardProps) {
  const { bg, text } = CARD_PALETTES[paletteIndex];
  const height = getCardHeight(name);
  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: bg, height }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={cardStyles.cardTop}>
        <View style={[cardStyles.pill, { backgroundColor: 'rgba(0,0,0,0.10)' }]}>
          <Text style={[cardStyles.pillText, { color: text }]}>{cadenceLabel}</Text>
        </View>
        {isMuted && (
          <View style={[cardStyles.pill, { backgroundColor: 'rgba(0,0,0,0.10)', paddingHorizontal: 8, paddingVertical: 5 }]}>
            <Ionicons name="volume-mute" size={13} color={text} />
          </View>
        )}
      </View>
      <View style={cardStyles.cardBottom}>
        <Text style={[cardStyles.cardName, { color: text }]} numberOfLines={2}>{name}</Text>
        <Text style={[cardStyles.cardMeta, { color: text, opacity: 0.6 }]}>
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── PendingCard ──────────────────────────────────────────────────────────────

interface PendingCardProps {
  name: string;
  cadenceLabel: string;
  memberCount: number;
  paletteIndex: number;
  onPress: () => void;
}

function PendingCard({ name, cadenceLabel, memberCount, paletteIndex, onPress }: PendingCardProps) {
  const { bg, text } = CARD_PALETTES[paletteIndex];
  const height = getCardHeight(name);
  return (
    <TouchableOpacity
      style={[cardStyles.card, cardStyles.pendingCard, { backgroundColor: bg + 'AA', height, borderColor: text + '55' }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={cardStyles.cardTop}>
        <View style={[cardStyles.pill, { backgroundColor: 'rgba(0,0,0,0.10)' }]}>
          <Text style={[cardStyles.pillText, { color: text, opacity: 0.7 }]}>{cadenceLabel}</Text>
        </View>
        <View style={[cardStyles.pill, { backgroundColor: 'rgba(0,0,0,0.08)' }]}>
          <Text style={[cardStyles.pillText, { color: text, opacity: 0.8 }]}>Pending</Text>
        </View>
      </View>
      <View style={[cardStyles.cardBottom, { opacity: 0.65 }]}>
        <Text style={[cardStyles.cardName, { color: text }]} numberOfLines={2}>{name}</Text>
        <Text style={[cardStyles.cardMeta, { color: text, opacity: 0.6 }]}>
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── MasonryGrid ──────────────────────────────────────────────────────────────

interface GridItem { type: 'group'; data: GroupDTO; }
interface PendingGridItem { type: 'pending'; data: Invitation; }
type AnyGridItem = GridItem | PendingGridItem;

interface MasonryGridProps {
  items: AnyGridItem[];
  colorPrefs: Record<string, number | null>;
  onPressGroup: (groupId: string) => void;
  onPressInvitation: (invitationId: string) => void;
}

function MasonryGrid({ items, colorPrefs, onPressGroup, onPressInvitation }: MasonryGridProps) {
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);

  const resolvePaletteIndex = (id: string, name: string) =>
    colorPrefs[id] ?? defaultPaletteIndex(name);

  const renderItem = (item: AnyGridItem, key: string) => {
    if (item.type === 'group') {
      const g = item.data;
      return (
        <BentoCard
          key={key}
          name={g.name}
          cadenceLabel={getCadenceLabel(g.cadence, g.weekly_frequency)}
          memberCount={g.member_count}
          isMuted={g.is_muted}
          paletteIndex={resolvePaletteIndex(g.id, g.name)}
          onPress={() => onPressGroup(g.id)}
        />
      );
    }
    const inv = item.data;
    return (
      <PendingCard
        key={key}
        name={inv.group.name}
        cadenceLabel={getCadenceLabel(inv.group.cadence, inv.group.weekly_frequency)}
        memberCount={inv.group.member_count}
        paletteIndex={resolvePaletteIndex(inv.group.id, inv.group.name)}
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
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [colorPrefs, setColorPrefs] = useState<Record<string, number | null>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');

  const styles = useMemo(() => makeStyles(colors, shadow), [colors]);

  const loadData = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const [groupsRes, invitationsRes] = await Promise.all([
        client.get<{ groups: GroupDTO[] }>('/groups'),
        client.getMyInvitations(),
      ]);
      setGroups(groupsRes.groups);
      setInvitations(invitationsRes.invitations);
      const allIds = [
        ...groupsRes.groups.map(g => g.id),
        ...invitationsRes.invitations.map(i => i.group.id),
      ];
      setColorPrefs(await getGroupColorIndices(allIds));
    } catch (error) {
      console.error('Failed to load data:', error);
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
                  <Text style={styles.filterBadgeText}>{invitations.length}</Text>
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
        {isEmpty ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconContainer}>{emptyIcon}</View>
            <Text style={styles.emptyTitle}>{emptyMessage.title}</Text>
            <Text style={styles.emptySubtitle}>{emptyMessage.sub}</Text>
          </View>
        ) : (
          <MasonryGrid
            items={gridItems}
            colorPrefs={colorPrefs}
            onPressGroup={(groupId) => navigation.navigate('GroupDetail', { groupId })}
            onPressInvitation={() => navigation.navigate('Invitations')}
          />
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateGroup')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
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
    filterBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
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
      ...shadow.lg,
    },
  });
}
