import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { parseApiError } from '@orbit/shared';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { getGroupColorIndex, setGroupColorIndex, defaultPaletteIndex, CARD_PALETTES } from '../utils/groupColors';

type GroupDetailRouteProp = RouteProp<RootStackParamList, 'GroupDetail'>;
type GroupDetailNavigationProp = StackNavigationProp<RootStackParamList, 'GroupDetail'>;

function MemberAvatar({ username, isOwner, colors }: { username: string; isOwner: boolean; colors: any }) {
  const initial = username.trim().charAt(0).toUpperCase();
  return (
    <View style={[
      { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
      { backgroundColor: isOwner ? colors.primary : colors.primaryLight },
    ]}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: isOwner ? '#fff' : colors.primary }}>
        {initial}
      </Text>
    </View>
  );
}

export default function GroupDetailScreen() {
  const route = useRoute<GroupDetailRouteProp>();
  const navigation = useNavigation<GroupDetailNavigationProp>();
  const { groupId } = route.params;
  const { theme: { colors, typography, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, typography, shadow), [colors]);

  const [group, setGroup] = useState<any>(null);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [paletteIndex, setPaletteIndex] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadGroupDetails = async () => {
    setLoadError(null);
    try {
      const client = await createAuthenticatedApiClient();
      const userInfo = await client.get<any>('/me');
      setCurrentUserId(userInfo.id);
      const groupData = await client.get<any>(`/groups/${groupId}`);
      setGroup(groupData);
      const callData = await client.get<{ current: any }>(`/groups/${groupId}/calls/current`);
      setCurrentCall(callData.current);
      const saved = await getGroupColorIndex(groupId);
      setPaletteIndex(saved);
    } catch (error) {
      console.error('Failed to load group:', error);
      setLoadError('Could not load group details.');
    }
  };

  const pickColor = async (index: number) => {
    setPaletteIndex(index);
    await setGroupColorIndex(groupId, index);
  };

  useEffect(() => {
    loadGroupDetails();
    const unsubscribe = navigation.addListener('focus', () => { loadGroupDetails(); });
    const poll = setInterval(loadGroupDetails, 10000);
    return () => { unsubscribe(); clearInterval(poll); };
  }, [groupId, navigation]);

  useEffect(() => {
    if (!group || !currentUserId) return;
    const isOwner = group.owner_id === currentUserId;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('GroupSettings', { groupId, isOwner })}
          style={styles.headerButton}
        >
          <Ionicons name="settings-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [group, currentUserId, groupId, navigation, colors]);

  const startCall = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const call = await client.post<any>(`/groups/${groupId}/call-now`, {});
      const tokenData = await client.post<any>(`/groups/${groupId}/calls/${call.id}/join-token`, {});
      navigation.navigate('Call', {
        callId: call.id, groupId, roomUrl: tokenData.room_url,
        token: tokenData.token, endsAt: tokenData.ends_at ?? undefined,
      });
    } catch (error: any) {
      Alert.alert('Error', parseApiError(error));
    }
  };

  const joinCall = async () => {
    if (!currentCall) return;
    try {
      const client = await createAuthenticatedApiClient();
      const tokenData = await client.post<any>(`/groups/${groupId}/calls/${currentCall.id}/join-token`, {});
      navigation.navigate('Call', {
        callId: currentCall.id, groupId, roomUrl: tokenData.room_url,
        token: tokenData.token, endsAt: tokenData.ends_at ?? undefined,
      });
    } catch (error: any) {
      Alert.alert('Error', parseApiError(error));
    }
  };

  const removeMember = async (memberId: string, memberUsername: string) => {
    Alert.alert('Remove Member', `Remove ${memberUsername} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            const client = await createAuthenticatedApiClient();
            await client.delete(`/groups/${groupId}/members/${memberId}`);
            await loadGroupDetails();
          } catch (error: any) {
            Alert.alert('Error', parseApiError(error));
          }
        },
      },
    ]);
  };

  const isOwner = group?.owner_id === currentUserId;
  const resolvedPaletteIndex = paletteIndex ?? (group ? defaultPaletteIndex(group.name) : 0);

  if (!group) {
    if (loadError) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>{loadError}</Text>
          <TouchableOpacity onPress={loadGroupDetails}>
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 16 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const getCadenceText = () => {
    if (group.cadence === 'daily') return 'Daily calls';
    return `${group.weekly_frequency} calls/week`;
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header card */}
      <View style={styles.headerCard}>
        <View style={styles.groupIconContainer}>
          <Text style={styles.groupIconText}>
            {group.name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.groupName}>{group.name}</Text>
        <View style={styles.infoRow}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>{getCadenceText()}</Text>
          </View>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>{group.call_duration_minutes} min</Text>
          </View>
          {group.is_muted && (
            <View style={styles.mutedBadge}>
              <Ionicons name="volume-mute" size={12} color={colors.textSecondary} />
              <Text style={styles.mutedBadgeText}>Muted</Text>
            </View>
          )}
        </View>

        <View style={styles.colorPickerRow}>
          {CARD_PALETTES.map((palette, index) => {
            const isSelected = index === resolvedPaletteIndex;
            return (
              <TouchableOpacity
                key={index}
                style={[styles.colorSwatch, { backgroundColor: palette.bg }, isSelected && styles.colorSwatchSelected]}
                onPress={() => pickColor(index)}
                activeOpacity={0.7}
              >
                {isSelected && <Ionicons name="checkmark" size={12} color={palette.text} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Call action */}
      <View style={styles.callSection}>
        {currentCall ? (
          <View style={styles.activeCallCard}>
            <View style={styles.activeCallIndicator} />
            <View style={styles.activeCallContent}>
              <Text style={styles.activeCallTitle}>Call in progress</Text>
              <Text style={styles.activeCallSub}>Join your group now</Text>
            </View>
            <TouchableOpacity style={styles.joinButton} onPress={joinCall}>
              <Text style={styles.joinButtonText}>Join</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.startCallButton} onPress={startCall} activeOpacity={0.85}>
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.startCallText}>Start Call Now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Members */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Members<Text style={styles.sectionCount}> {group.member_count}</Text>
          </Text>
          {isOwner && (
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={() => navigation.navigate('InviteUser', { groupId })}
            >
              <Text style={styles.inviteButtonText}>+ Invite</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.membersCard}>
          {group.members.map((member: any, index: number) => {
            const isMemberOwner = member.role === 'owner';
            const isLast = index === group.members.length - 1;
            return (
              <View
                key={member.user_id}
                style={[styles.memberRow, isLast && styles.memberRowLast]}
              >
                <MemberAvatar username={member.username} isOwner={isMemberOwner} colors={colors} />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.username}</Text>
                  {isMemberOwner && (
                    <View style={styles.ownerBadge}>
                      <Text style={styles.ownerBadgeText}>Owner</Text>
                    </View>
                  )}
                </View>
                {isOwner && !isMemberOwner && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeMember(member.user_id, member.username)}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: any, typography: any, shadow: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    headerButton: { marginRight: spacing.lg, padding: spacing.xs },
    headerCard: {
      backgroundColor: colors.surface,
      margin: spacing.xl,
      borderRadius: radius.xl,
      padding: spacing.xxl,
      alignItems: 'center',
      ...shadow.sm,
    },
    groupIconContainer: {
      width: 72, height: 72, borderRadius: radius.xl,
      backgroundColor: colors.primary,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: spacing.lg,
      ...shadow.lg,
    },
    groupIconText: { fontSize: 32, fontWeight: '700', color: '#fff' },
    groupName: { ...typography.h3, marginBottom: spacing.md, textAlign: 'center' },
    infoRow: { flexDirection: 'row', gap: spacing.sm },
    infoBadge: {
      backgroundColor: colors.primaryLighter,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
    },
    infoBadgeText: { ...typography.captionMedium, color: colors.primary, fontWeight: '600' },
    mutedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
      borderRadius: radius.full,
    },
    mutedBadgeText: { ...typography.captionMedium, color: colors.textSecondary, fontWeight: '600' },
    colorPickerRow: {
      flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg,
      flexWrap: 'wrap', justifyContent: 'center',
    },
    colorSwatch: {
      width: 28, height: 28, borderRadius: radius.full,
      justifyContent: 'center', alignItems: 'center',
    },
    colorSwatchSelected: {
      borderWidth: 2, borderColor: colors.text,
    },
    callSection: { marginHorizontal: spacing.xl, marginBottom: spacing.xl },
    activeCallCard: {
      backgroundColor: colors.success,
      borderRadius: radius.lg, padding: spacing.lg,
      flexDirection: 'row', alignItems: 'center',
      ...shadow.md,
    },
    activeCallIndicator: {
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: '#fff', marginRight: spacing.md, opacity: 0.9,
    },
    activeCallContent: { flex: 1 },
    activeCallTitle: { ...typography.bodySemibold, color: '#fff' },
    activeCallSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    joinButton: {
      backgroundColor: '#fff',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
      borderRadius: radius.full,
    },
    joinButtonText: { ...typography.captionMedium, color: colors.successDark, fontWeight: '700' },
    startCallButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.lg, paddingVertical: spacing.lg,
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
      gap: spacing.sm,
      ...shadow.lg,
    },
    startCallText: { ...typography.bodySemibold, color: '#fff' },
    section: { marginHorizontal: spacing.xl, marginBottom: spacing.xxl },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    sectionTitle: { ...typography.h4 },
    sectionCount: { ...typography.h4, color: colors.textTertiary },
    inviteButton: {
      backgroundColor: colors.primaryLight,
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
      borderRadius: radius.full,
    },
    inviteButtonText: { ...typography.captionMedium, color: colors.primary, fontWeight: '700' },
    membersCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.sm },
    memberRow: {
      flexDirection: 'row', alignItems: 'center',
      padding: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    memberRowLast: { borderBottomWidth: 0 },
    memberInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    memberName: { ...typography.bodyMedium },
    ownerBadge: {
      backgroundColor: colors.primaryLighter,
      paddingHorizontal: spacing.sm, paddingVertical: 2,
      borderRadius: radius.full,
    },
    ownerBadgeText: { ...typography.small, color: colors.primary, fontWeight: '600' },
    removeButton: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
      borderRadius: radius.full, borderWidth: 1, borderColor: colors.danger,
    },
    removeButtonText: { ...typography.small, color: colors.danger, fontWeight: '600' },
  });
}
