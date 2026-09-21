import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  ActionSheetIOS,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import type { GroupDetailDTO } from '@orbit/shared';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { layout, radius, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { CadenceFields } from '../components/CadenceFields';
import { CallWindowField, WindowPreview } from '../components/CallWindowField';
import { Field, TextField } from '../components/Field';
import { FormHeader } from '../components/FormHeader';
import { FormScreen } from '../components/FormScreen';
import { GroupPhotoPicker } from '../components/GroupPhotoPicker';
import { Icon } from '../components/Icon';
import { SettingRow } from '../components/SettingRow';
import { formatHour, durationMax, cadenceSummary } from '../utils/groupFormat';

type GroupSettingsRouteProp = RouteProp<RootStackParamList, 'GroupSettings'>;
type GroupSettingsNavigationProp = StackNavigationProp<RootStackParamList, 'GroupSettings'>;

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
  // True while a dial handle is held, so the form's ScrollView doesn't take the drag.
  const [dialDragging, setDialDragging] = useState(false);
  // Not part of `hasChanges`: the photo is saved the moment it is picked, like the
  // avatar, so there is nothing for "Save changes" to hold back.
  const [photo, setPhoto] = useState<{ hasPhoto: boolean; photoUpdatedAt: string | null }>({
    hasPhoto: false,
    photoUpdatedAt: null,
  });

  const hasChanges =
    groupName !== savedName ||
    cadence !== savedCadence ||
    frequency !== savedFrequency ||
    callDuration !== savedCallDuration ||
    windowStart !== savedWindowStart ||
    windowEnd !== savedWindowEnd;

  useEffect(() => { loadGroupSettings(); }, []);

  const loadGroupSettings = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const group = await client.get<GroupDetailDTO>(`/groups/${groupId}`);
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
      setPhoto({ hasPhoto: group.has_photo, photoUpdatedAt: group.photo_updated_at });
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
      const group = await client.get<GroupDetailDTO>(`/groups/${groupId}`);
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

  const goBack = () => navigation.goBack();

  // Drawn while loading too: the navigator no longer supplies a back button, and a
  // failed load leaves this spinner up.
  if (loading) {
    return (
      <View style={styles.flex}>
        <FormHeader title="Group settings" onBack={goBack} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.textSecondary} />
        </View>
      </View>
    );
  }

  const cadenceLabel = cadenceSummary(savedCadence, savedFrequency);
  const windowSummary = `${formatHour(savedWindowStart)} – ${formatHour(savedWindowEnd)}`;

  return (
    <FormScreen
      title="Group settings"
      onBack={goBack}
      action={{
        label: 'Save changes',
        onPress: saveSettings,
        disabled: !hasChanges,
        caption: hasChanges ? undefined : 'Nothing to save yet.',
      }}
      scrollEnabled={!dialDragging}
    >
      <GroupPhotoPicker
        groupId={groupId}
        name={groupName}
        editable={isOwner}
        hasPhoto={photo.hasPhoto}
        photoUpdatedAt={photo.photoUpdatedAt}
        onChange={setPhoto}
      />

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
          <CadenceFields
            cadence={cadence}
            onCadenceChange={setCadence}
            frequency={frequency}
            onFrequencyChange={setFrequency}
            duration={callDuration}
            onDurationChange={setCallDuration}
            durationCeiling={durationMax(savedCallDuration)}
          />

          <CallWindowField
            start={windowStart}
            end={windowEnd}
            onChangeStart={setWindowStart}
            onChangeEnd={setWindowEnd}
            onDragChange={setDialDragging}
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
    </FormScreen>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors']) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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
