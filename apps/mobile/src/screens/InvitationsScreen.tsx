import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

type InvitationsNavigationProp = StackNavigationProp<RootStackParamList, 'Invitations'>;

interface Invitation {
  id: string;
  group: {
    id: string; name: string; cadence: string;
    weekly_frequency: number | null; call_duration_minutes: number; member_count: number;
  };
  invited_by: string;
  created_at: string;
  expires_at: string;
}

export default function InvitationsScreen() {
  const navigation = useNavigation<InvitationsNavigationProp>();
  const { theme: { colors, typography, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, typography, shadow), [colors]);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const loadInvitations = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const client = await createAuthenticatedApiClient();
      const result = await client.getMyInvitations();
      setInvitations(result.invitations);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load invitations');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { loadInvitations(); }, []);

  const respondToInvite = async (inviteId: string, action: 'accept' | 'decline' | 'dismiss') => {
    setRespondingTo(inviteId);
    try {
      const client = await createAuthenticatedApiClient();
      const result = await client.respondToInvitation(inviteId, action);
      if (action === 'accept') {
        Alert.alert('Joined!', `You joined ${result.group?.name}!`, [
          { text: 'OK', onPress: () => navigation.navigate('Main') },
        ]);
      } else if (action === 'decline') {
        Alert.alert('Declined', 'Invitation declined');
      }
      loadInvitations();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to respond to invitation');
    } finally {
      setRespondingTo(null);
    }
  };

  const getCadenceText = (invitation: Invitation) => {
    if (invitation.group.cadence === 'daily') return 'Daily calls';
    return `${invitation.group.weekly_frequency} calls/week`;
  };

  const renderInvitation = ({ item }: { item: Invitation }) => {
    const isResponding = respondingTo === item.id;
    const initial = item.group.name.trim().charAt(0).toUpperCase();
    return (
      <View style={styles.inviteCard}>
        <View style={styles.cardHeader}>
          <View style={styles.groupAvatar}>
            <Text style={styles.groupAvatarText}>{initial}</Text>
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.groupName}>{item.group.name}</Text>
            <Text style={styles.invitedBy}>Invited by {item.invited_by}</Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailPill}><Text style={styles.detailPillText}>{getCadenceText(item)}</Text></View>
          <View style={styles.detailPill}><Text style={styles.detailPillText}>{item.group.call_duration_minutes} min</Text></View>
          <View style={styles.detailPill}>
            <Text style={styles.detailPillText}>
              {item.group.member_count} {item.group.member_count === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>
        {isResponding ? (
          <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={() => respondToInvite(item.id, 'accept')} activeOpacity={0.85}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.dismissButton]} onPress={() => respondToInvite(item.id, 'dismiss')} activeOpacity={0.85}>
              <Text style={styles.dismissButtonText}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.declineButton]} onPress={() => respondToInvite(item.id, 'decline')} activeOpacity={0.85}>
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return <View style={styles.centerContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (invitations.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="mail-outline" size={48} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
        <Text style={styles.emptyTitle}>No pending invitations</Text>
        <Text style={styles.emptySubtitle}>You're all caught up</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={invitations}
        renderItem={renderInvitation}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadInvitations(true)} tintColor={colors.primary} />
        }
      />
    </View>
  );
}

function makeStyles(colors: any, typography: any, shadow: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, paddingBottom: 80 },
    emptyTitle: { ...typography.h4, color: colors.textSecondary, marginBottom: spacing.xs },
    emptySubtitle: { ...typography.caption, color: colors.textTertiary },
    listContent: { padding: spacing.xl, paddingBottom: 40 },
    inviteCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadow.sm },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    groupAvatar: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
    groupAvatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },
    cardHeaderText: { flex: 1 },
    groupName: { ...typography.h4, marginBottom: 2 },
    invitedBy: { ...typography.caption, color: colors.textSecondary },
    detailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    detailPill: { backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
    detailPillText: { ...typography.small, color: colors.textSecondary, fontWeight: '500' },
    actionRow: { flexDirection: 'row', gap: spacing.sm },
    actionButton: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.full, alignItems: 'center' },
    acceptButton: { backgroundColor: colors.success },
    acceptButtonText: { ...typography.captionMedium, color: '#fff', fontWeight: '700' },
    dismissButton: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    dismissButtonText: { ...typography.captionMedium, color: colors.textSecondary, fontWeight: '600' },
    declineButton: { backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: colors.danger },
    declineButtonText: { ...typography.captionMedium, color: colors.danger, fontWeight: '600' },
    loadingRow: { paddingVertical: spacing.md, alignItems: 'center' },
  });
}
