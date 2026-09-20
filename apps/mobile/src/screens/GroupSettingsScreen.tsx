import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Share,
  ActionSheetIOS,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import type { GroupDTO, GroupMember } from '@orbit/shared';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { layout, radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { BottomActionBar } from '../components/BottomActionBar';
import { CallWindowField, WindowPreview } from '../components/CallWindowField';
import { Display } from '../components/Display';
import { Field, TextField } from '../components/Field';
import { FormHeader } from '../components/FormHeader';
import { Icon } from '../components/Icon';
import NumberPicker from '../components/NumberPicker';
import { SegmentedControl } from '../components/SegmentedControl';
import { SettingRow } from '../components/SettingRow';
import { CADENCE_OPTIONS, MIN_CALL_DURATION, formatHour, durationMax, cadenceSummary } from '../utils/groupFormat';

type GroupSettingsRouteProp = RouteProp<RootStackParamList, 'GroupSettings'>;
type GroupSettingsNavigationProp = StackNavigationProp<RootStackParamList, 'GroupSettings'>;

// GET /groups/:id also sends each member's username and time_zone, which the
// list-shaped `members` on GroupDTO doesn't declare.
type GroupDetail = Omit<GroupDTO, 'members'> & {
  members: Array<GroupMember & { username: string; time_zone: string }>;
};

const THUMB_SIZE = 88;
const BADGE_SIZE = 32;
const BADGE_RING = 2;
const BADGE_OFFSET = -6;

// The group's photo, or — until it has one — the `surface` fill with its initial,
// the way an avatar falls back. The camera badge is drawn at full fidelity but is
// not yet wired to anything, so it is out of the accessibility tree rather than a
// button that announces itself and does nothing.
function GroupPhotoThumb({ name, editable, styles }: {
  name: string;
  editable: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { theme: { colors } } = useTheme();
  return (
    <View style={styles.thumbWrap}>
      <View style={styles.thumb}>
        <Display size={26} color={colors.textMeta}>{name.trim().charAt(0)}</Display>
      </View>
      {editable && (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.badge}
        >
          <Icon name="camera" size={16} color={colors.onAccent} />
        </View>
      )}
    </View>
  );
}

export default function GroupSettingsScreen() {
  const route = useRoute<GroupSettingsRouteProp>();
  const navigation = useNavigation<GroupSettingsNavigationProp>();
  const { groupId, isOwner } = route.params;
  const { theme: { colors } } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sharingLink, setSharingLink] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [frequency, setFrequency] = useState(1);
  const [callDuration, setCallDuration] = useState(5);
  const [windowStart, setWindowStart] = useState(6);
  const [windowEnd, setWindowEnd] = useState(22);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(true);

  const [savedName, setSavedName] = useState('');
  const [savedCadence, setSavedCadence] = useState<'daily' | 'weekly'>('daily');
  const [savedFrequency, setSavedFrequency] = useState(1);
  const [savedCallDuration, setSavedCallDuration] = useState(5);
  const [savedWindowStart, setSavedWindowStart] = useState(6);
  const [savedWindowEnd, setSavedWindowEnd] = useState(22);
  const [groupTz, setGroupTz] = useState<string>('UTC');
  const [memberTimeZones, setMemberTimeZones] = useState<string[]>([]);

  const hasChanges =
    groupName !== savedName ||
    cadence !== savedCadence ||
    frequency !== savedFrequency ||
    callDuration !== savedCallDuration ||
    windowStart !== savedWindowStart ||
    windowEnd !== savedWindowEnd;

  const handleCadenceChange = (value: 'daily' | 'weekly') => {
    setCadence(value);
    setFrequency(1);
  };

  useEffect(() => { loadGroupSettings(); }, []);

  const loadGroupSettings = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const group = await client.get<GroupDetail>(`/groups/${groupId}`);
      const loadedCadence = group.cadence;
      const loadedFrequency = loadedCadence === 'weekly'
        ? (group.weekly_frequency || 1)
        : 1; // WS-6: daily is always 1x/day
      const loadedDuration = group.call_duration_minutes;
      const loadedWindowStart = group.call_window_start ?? 6;
      const loadedWindowEnd = group.call_window_end ?? 22;
      setGroupName(group.name); setCadence(loadedCadence); setFrequency(loadedFrequency);
      setCallDuration(loadedDuration); setWindowStart(loadedWindowStart); setWindowEnd(loadedWindowEnd);
      setIsMuted(group.is_muted ?? false);
      setGroupTz(group.time_zone ?? 'UTC');
      setMemberTimeZones(group.members.map((m) => m.time_zone));
      setSavedName(group.name); setSavedCadence(loadedCadence);
      setSavedFrequency(loadedFrequency); setSavedCallDuration(loadedDuration);
      setSavedWindowStart(loadedWindowStart); setSavedWindowEnd(loadedWindowEnd);
      setLoading(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to load group settings');
    }
  };

  const saveSettings = async () => {
    if (!groupName.trim()) { Alert.alert('Error', 'Group name cannot be empty'); return; }
    try {
      const client = await createAuthenticatedApiClient();
      const updates: any = {};
      if (groupName.trim() !== savedName) updates.name = groupName.trim();

      if (isOwner) {
        const cadenceChanged = cadence !== savedCadence;
        if (cadenceChanged) updates.cadence = cadence;
        // When cadence flips, always restate the frequency for the new cadence —
        // the server only derives daily_frequency, never weekly_frequency.
        if (cadenceChanged || frequency !== savedFrequency) {
          if (cadence === 'daily') updates.daily_frequency = 1;
          else updates.weekly_frequency = frequency;
        }
        if (callDuration !== savedCallDuration) updates.call_duration_minutes = callDuration;
        // Send the window as a pair so the two hours can never be updated independently.
        if (windowStart !== savedWindowStart || windowEnd !== savedWindowEnd) {
          updates.call_window_start = windowStart;
          updates.call_window_end = windowEnd;
        }
      }

      if (Object.keys(updates).length === 0) { navigation.goBack(); return; }

      await client.put(`/groups/${groupId}`, updates);
      setSavedName(groupName.trim());
      if (isOwner) {
        setSavedCadence(cadence); setSavedFrequency(frequency); setSavedCallDuration(callDuration);
        setSavedWindowStart(windowStart); setSavedWindowEnd(windowEnd);
      }
      Alert.alert('Saved', 'Group settings updated');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update group settings');
    }
  };

  const toggleMute = async (value: boolean) => {
    setIsMuted(value);
    try {
      const client = await createAuthenticatedApiClient();
      await client.put(`/groups/${groupId}/mute`, { muted: value });
    } catch (error: any) {
      setIsMuted(!value);
      Alert.alert('Error', error.message || 'Failed to update notification settings');
    }
  };

  const confirmTransfer = async (member: any, client: any) => {
    Alert.alert('Transfer Ownership', `Transfer ownership to ${member.username}? You will no longer be the owner.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Transfer', style: 'destructive',
        onPress: async () => {
          try {
            await client.post(`/groups/${groupId}/transfer-ownership`, { new_owner_id: member.user_id });
            Alert.alert('Done', `Ownership transferred to ${member.username}`, [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to transfer ownership');
          }
        },
      },
    ]);
  };

  const transferOwnership = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const group = await client.get<GroupDetail>(`/groups/${groupId}`);
      const members = group.members.filter((m) => m.user_id !== group.owner_id);
      if (members.length === 0) { Alert.alert('No Members', 'There are no other members to transfer ownership to'); return; }
      if (Platform.OS === 'ios') {
        const options = [...members.map((m) => m.username), 'Cancel'];
        const cancelButtonIndex = options.length - 1;
        ActionSheetIOS.showActionSheetWithOptions(
          { title: 'Transfer Ownership', message: 'Select new owner', options, cancelButtonIndex },
          (buttonIndex) => { if (buttonIndex !== cancelButtonIndex) confirmTransfer(members[buttonIndex], client); }
        );
      } else {
        const buttons = members.map((member) => ({ text: member.username, onPress: () => confirmTransfer(member, client) }));
        buttons.push({ text: 'Cancel', style: 'cancel' } as any);
        Alert.alert('Transfer Ownership', 'Select new owner:', buttons as any);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load members');
    }
  };

  const shareInviteLink = async () => {
    setSharingLink(true);
    try {
      const client = await createAuthenticatedApiClient();
      const { invite_link } = await client.createInviteLink(groupId);
      await Share.share({
        message: `Join my group "${groupName}" on Orbit: ${invite_link}`,
        url: invite_link,
      });
    } catch {
      Alert.alert('Error', 'Failed to create invite link.');
    } finally {
      setSharingLink(false);
    }
  };

  const leaveGroup = async () => {
    Alert.alert('Leave Group', `Leave "${groupName}"? You'll need to be re-invited to rejoin.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          try {
            const client = await createAuthenticatedApiClient();
            await client.post(`/groups/${groupId}/leave`, {});
            navigation.navigate('Home');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to leave group');
          }
        },
      },
    ]);
  };

  const deleteGroup = async () => {
    Alert.alert('Delete Group', `Delete "${groupName}"? This cannot be undone and will remove all members and call history.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const client = await createAuthenticatedApiClient();
            await client.delete(`/groups/${groupId}`);
            navigation.navigate('Home');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to delete group');
          }
        },
      },
    ]);
  };

  // Drawn while loading too: the navigator no longer supplies a back button, and a
  // failed load leaves this spinner up.
  const header = <FormHeader title="Group settings" onBack={() => navigation.goBack()} />;

  if (loading) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.textSecondary} />
        </View>
      </View>
    );
  }

  const cadenceLabel = cadenceSummary(savedCadence, savedFrequency);
  const windowSummary = `${formatHour(savedWindowStart)} – ${formatHour(savedWindowEnd)}`;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {header}
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <GroupPhotoThumb name={groupName} editable={isOwner} styles={styles} />

        <TextField
          label="Group name"
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Enter group name"
          helper="All members can update the group name"
        />

        {!isOwner && (
          <View>
            <SettingRow label="Call frequency" variant={{ type: 'value', value: cadenceLabel }} />
            <SettingRow label="Call duration" variant={{ type: 'value', value: `${savedCallDuration} min` }} />
            <SettingRow label="Call window" variant={{ type: 'value', value: windowSummary }} last />
            <WindowPreview start={savedWindowStart} end={savedWindowEnd} groupTz={groupTz} memberTimeZones={memberTimeZones} />
            <Text style={styles.ownerOnlyNote}>Only the group owner can change these.</Text>
          </View>
        )}

        {isOwner && (
          <>
            <View style={styles.block}>
              <Field label="Call frequency" helper={cadence === 'daily' ? 'One call per day.' : undefined}>
                <SegmentedControl options={CADENCE_OPTIONS} value={cadence} onChange={handleCadenceChange} />
              </Field>
              <View>
                {cadence === 'weekly' && (
                  <SettingRow
                    label="Calls per week"
                    variant={{
                      type: 'control',
                      control: <NumberPicker min={1} max={6} value={frequency} onChange={setFrequency} />,
                    }}
                  />
                )}
                <SettingRow
                  label="Call duration"
                  last
                  variant={{
                    type: 'control',
                    control: (
                      <NumberPicker
                        min={MIN_CALL_DURATION}
                        max={durationMax(savedCallDuration)}
                        value={callDuration}
                        onChange={setCallDuration}
                        suffix="min"
                        wide
                      />
                    ),
                  }}
                />
              </View>
            </View>

            <CallWindowField
              start={windowStart}
              end={windowEnd}
              onChangeStart={setWindowStart}
              onChangeEnd={setWindowEnd}
              groupTz={groupTz}
              memberTimeZones={memberTimeZones}
            />

            <Field label="Invite link" helper="Anyone with the link can join this group. Links expire in 7 days.">
              <TouchableOpacity
                style={[styles.shareRow, sharingLink && styles.shareRowDisabled]}
                onPress={shareInviteLink}
                disabled={sharingLink}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.shareLabel}>Share invite link</Text>
                {sharingLink
                  ? <ActivityIndicator size="small" color={colors.textSecondary} />
                  : <Icon name="share" size={20} color={colors.text} />}
              </TouchableOpacity>
            </Field>
          </>
        )}

        <View>
          <SettingRow
            label="Mute notifications"
            variant={{ type: 'toggle', value: isMuted, onToggle: toggleMute }}
            last={!isOwner}
          />
          {isOwner && (
            <SettingRow label="Transfer ownership" variant={{ type: 'chevron' }} onPress={transferOwnership} last />
          )}
        </View>

        {/* The owner's Delete is the danger zone. A member has no such thing, only
            a way out, so theirs is the same box without the heading. */}
        <View style={styles.dangerBox}>
          {isOwner && <Text style={styles.dangerHeading}>Danger zone</Text>}
          {isOwner ? (
            <SettingRow
              label="Delete group"
              danger
              last
              onPress={deleteGroup}
              variant={{ type: 'control', control: <Icon name="trash" size={20} color={colors.danger} /> }}
            />
          ) : (
            <SettingRow label="Leave group" danger last onPress={leaveGroup} variant={{ type: 'chevron' }} />
          )}
        </View>
      </ScrollView>

      <BottomActionBar
        label="Save changes"
        onPress={saveSettings}
        disabled={!hasChanges}
        caption={hasChanges ? undefined : 'Nothing to save yet.'}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors']) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: {
      paddingHorizontal: layout.screenPad,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xl,
      gap: spacing.xl,
    },

    thumbWrap: { width: THUMB_SIZE, height: THUMB_SIZE },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: radius.xxl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // A 32pt marigold disc inside a 2pt ring the colour of the page, so it reads
    // as cut out of the thumb's corner.
    badge: {
      position: 'absolute',
      right: BADGE_OFFSET,
      bottom: BADGE_OFFSET,
      width: BADGE_SIZE + BADGE_RING * 2,
      height: BADGE_SIZE + BADGE_RING * 2,
      borderRadius: radius.full,
      backgroundColor: colors.accent,
      borderWidth: BADGE_RING,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // The cadence control and the rows under it read as one group, tighter than
    // the blocks around them.
    block: { gap: spacing.sm },
    ownerOnlyNote: {
      fontFamily: 'Geist_400Regular',
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },

    shareRow: {
      minHeight: layout.secondaryBtn,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    shareRowDisabled: { opacity: 0.5 },
    shareLabel: { fontFamily: 'Geist_500Medium', fontSize: 16, color: colors.text },

    dangerBox: {
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      borderRadius: radius.xl,
      paddingHorizontal: 14,
    },
    dangerHeading: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 13,
      color: colors.danger,
      paddingTop: 14,
    },
  });
}
