import { useEffect, useState, useMemo } from 'react';
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
import * as Localization from 'expo-localization';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { formatViewerWindow, parseApiError, type GroupDetailDTO } from '@orbit/shared';
import { cadenceSummary, formatHour } from '../utils/groupFormat';
import { layout, onPhoto, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { BottomActionBar } from '../components/BottomActionBar';
import { Display } from '../components/Display';
import { FormHeader } from '../components/FormHeader';
import { GroupPhotoHeader } from '../components/GroupPhotoHeader';
import { UserAvatar } from '../components/UserAvatar';

type GroupDetailRouteProp = RouteProp<RootStackParamList, 'GroupDetail'>;
type GroupDetailNavigationProp = StackNavigationProp<RootStackParamList, 'GroupDetail'>;

// Appendix B: the title starts at y=296 and its single line is 40pt tall (a 32pt
// display size is drawn at 36pt, at 1.12 leading); the first row starts at y=382.
const ROWS_GAP = 382 - (296 + 40);
// Two full 56pt rows and a sliver of the third, so it reads as scrollable.
const MEMBER_LIST_HEIGHT = 122;
const MEMBER_AVATAR = 36;

export default function GroupDetailScreen() {
  const route = useRoute<GroupDetailRouteProp>();
  const navigation = useNavigation<GroupDetailNavigationProp>();
  const { groupId } = route.params;
  const { theme: { colors } } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [group, setGroup] = useState<GroupDetailDTO | null>(null);
  const [currentCall, setCurrentCall] = useState<{ id: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadGroupDetails = async () => {
    setLoadError(null);
    try {
      const client = await createAuthenticatedApiClient();
      const userInfo = await client.get<any>('/me');
      setCurrentUserId(userInfo.id);
      const groupData = await client.get<GroupDetailDTO>(`/groups/${groupId}`);
      setGroup(groupData);
      const callData = await client.get<{ current: { id: string } | null }>(`/groups/${groupId}/calls/current`);
      setCurrentCall(callData.current);
    } catch (error) {
      console.error('Failed to load group:', error);
      setLoadError('Could not load group details.');
    }
  };

  useEffect(() => {
    loadGroupDetails();
    const unsubscribe = navigation.addListener('focus', () => { loadGroupDetails(); });
    const poll = setInterval(loadGroupDetails, 10000);
    return () => { unsubscribe(); clearInterval(poll); };
  }, [groupId, navigation]);

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

  // The linking config has no initialRouteName, so a cold orbit://group/:id link
  // opens with this screen alone on the stack and goBack() would do nothing.
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home'));

  // No photo header yet, so no dark ground for a light status bar to sit on: the
  // app's own, theme-following bar stays. The way back has to be drawn here too,
  // since the navigator no longer supplies one.
  if (!group) {
    return (
      <View style={styles.container}>
        <FormHeader onBack={goBack} />
        <View style={styles.centered}>
          {loadError ? (
            <>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity onPress={loadGroupDetails} accessibilityRole="button">
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator size="large" color={colors.textSecondary} />
          )}
        </View>
      </View>
    );
  }

  const start: number = group.call_window_start;
  const end: number = group.call_window_end;
  const groupTz: string = group.time_zone;
  const viewerTz = Localization.getCalendars()[0]?.timeZone ?? 'UTC';
  // The zone under the window, then — only when it differs — what the window is for you.
  const windowNotes = [
    groupTz,
    ...(groupTz !== viewerTz ? [`${formatViewerWindow(start, end, groupTz, viewerTz)} your time`] : []),
  ];

  const detailRow = (label: string, value: string, notes: string[] = [], last = false) => (
    <View key={label} style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueBlock}>
        <Text style={styles.detailValue}>{value}</Text>
        {notes.map((note) => (
          <Text key={note} style={styles.detailNote}>{note}</Text>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        // The photo runs to the top edge; a bounce would open a gap above it.
        bounces={false}
        overScrollMode="never"
      >
        <GroupPhotoHeader
          onBack={goBack}
          onSettings={() => navigation.navigate('GroupSettings', { groupId, isOwner })}
        />

        <View style={styles.titleBlock}>
          <Display
            size={32}
            leading={1.12}
            numberOfLines={2}
            ellipsizeMode="tail"
            accessibilityRole="header"
            style={onPhoto.textShadow}
          >
            {group.name}
          </Display>
        </View>

        <View style={styles.rows}>
          {detailRow('Calls', cadenceSummary(group.cadence, group.weekly_frequency || 1))}
          {detailRow('Length', `${group.call_duration_minutes} min`)}
          {detailRow('Call window', `${formatHour(start)} – ${formatHour(end)}`, windowNotes, true)}
        </View>

        <View style={styles.membersHeader}>
          <View style={styles.membersTitleRow}>
            <Text accessibilityRole="header" style={styles.membersTitle}>Members</Text>
            <Text style={styles.membersCount}>{group.member_count}</Text>
          </View>
          {isOwner && (
            // A sibling View, not textDecorationLine: RN ignores textDecorationColor
            // on Android and the offset everywhere (Appendix E).
            <TouchableOpacity
              onPress={() => navigation.navigate('InviteUser', { groupId })}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel="Invite a member"
            >
              <Text style={styles.inviteText}>Invite</Text>
              <View style={styles.inviteRule} />
            </TouchableOpacity>
          )}
        </View>

        {/* A ScrollView, not a FlatList: a FlatList nested in this ScrollView is a
            VirtualizedList inside a VirtualizedList and warns. The list scrolls in
            place so the window above and the call button below stay put. */}
        <ScrollView
          style={styles.memberList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {group.members.map((member, index) => {
            const isMemberOwner = member.role === 'owner';
            return (
              <View
                key={member.user_id}
                style={[styles.memberRow, index === group.members.length - 1 && styles.memberRowLast]}
              >
                <UserAvatar
                  userId={member.user_id}
                  username={member.username}
                  hasAvatar={member.has_avatar}
                  avatarUpdatedAt={member.avatar_updated_at}
                  size={MEMBER_AVATAR}
                  colors={colors}
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>{member.username}</Text>
                  {isMemberOwner && <Text style={styles.ownerLabel}>Owner</Text>}
                </View>
                {isOwner && !isMemberOwner && (
                  <TouchableOpacity
                    onPress={() => removeMember(member.user_id, member.username)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${member.username}`}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      </ScrollView>

      {/* A live call takes the one primary action: nobody starts a second call
          in a group that already has one. */}
      <BottomActionBar
        label={currentCall ? 'Join call' : 'Start call now'}
        onPress={currentCall ? joinCall : startCall}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xl },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: layout.screenPad },
    errorText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    retryText: { fontFamily: 'Geist_600SemiBold', fontSize: 16, color: colors.text },

    titleBlock: { paddingHorizontal: layout.screenPad },
    rows: { marginTop: ROWS_GAP, marginHorizontal: layout.screenPad },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    detailRowLast: { borderBottomWidth: 0 },
    detailLabel: { fontFamily: 'Gelasio_400Regular', fontSize: 15, color: colors.textSecondary },
    detailValueBlock: { flexShrink: 1, alignItems: 'flex-end' },
    detailValue: { fontFamily: 'Geist_500Medium', fontSize: 16, color: colors.text, textAlign: 'right' },
    detailNote: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12.5,
      color: colors.textMeta,
      textAlign: 'right',
      marginTop: 2,
    },

    membersHeader: {
      minHeight: 48,
      marginTop: spacing.lg,
      marginHorizontal: layout.screenPad,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    membersTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    membersTitle: { fontFamily: 'Geist_600SemiBold', fontSize: 16, color: colors.text },
    membersCount: { fontFamily: 'GeistMono_500Medium', fontSize: 13, color: colors.textMeta },
    inviteText: { fontFamily: 'Geist_500Medium', fontSize: 15, color: colors.text },
    // Marigold on cream is 1.60:1 — fine as a rule, never as the text itself.
    inviteRule: { marginTop: 2, borderBottomWidth: 1.5, borderBottomColor: colors.accent },

    memberList: { height: MEMBER_LIST_HEIGHT, marginHorizontal: layout.screenPad },
    memberRow: {
      minHeight: layout.rowHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    memberRowLast: { borderBottomWidth: 0 },
    memberInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    memberName: { flexShrink: 1, fontFamily: 'Geist_500Medium', fontSize: 16, color: colors.text },
    ownerLabel: { fontFamily: 'GeistMono_500Medium', fontSize: 12, color: colors.textMeta },
    removeText: { fontFamily: 'Geist_500Medium', fontSize: 14, color: colors.danger },
  });
}
