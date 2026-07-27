import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
  Share,
  ActionSheetIOS,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Localization from 'expo-localization';
import { formatViewerWindow } from '@orbit/shared';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import NumberPicker from '../components/NumberPicker';

type GroupSettingsRouteProp = RouteProp<RootStackParamList, 'GroupSettings'>;
type GroupSettingsNavigationProp = StackNavigationProp<RootStackParamList, 'GroupSettings'>;

export default function GroupSettingsScreen() {
  const route = useRoute<GroupSettingsRouteProp>();
  const navigation = useNavigation<GroupSettingsNavigationProp>();
  const { groupId, isOwner } = route.params;
  const { theme: { colors, typography, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, typography, shadow), [colors]);

  const [sharingLink, setSharingLink] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [frequency, setFrequency] = useState(1);
  const [callDuration, setCallDuration] = useState(15);
  const [windowStart, setWindowStart] = useState(6);
  const [windowEnd, setWindowEnd] = useState(22);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(true);

  const [savedName, setSavedName] = useState('');
  const [savedCadence, setSavedCadence] = useState<'daily' | 'weekly'>('daily');
  const [savedFrequency, setSavedFrequency] = useState(1);
  const [savedCallDuration, setSavedCallDuration] = useState(15);
  const [savedWindowStart, setSavedWindowStart] = useState(6);
  const [savedWindowEnd, setSavedWindowEnd] = useState(22);
  const [groupTz, setGroupTz] = useState<string>('UTC');
  const viewerTz = Localization.getCalendars()[0]?.timeZone ?? 'UTC';

  const formatHour = (h: number): string => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

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
      const group = await client.get<any>(`/groups/${groupId}`);
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
      const updates: any = { name: groupName.trim() };
      if (isOwner) {
        updates.cadence = cadence;
        updates.call_duration_minutes = callDuration;
        if (cadence === 'daily') updates.daily_frequency = 1;
        else updates.weekly_frequency = frequency;
        updates.call_window_start = windowStart;
        updates.call_window_end = windowEnd;
      }
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
      const group = await client.get<any>(`/groups/${groupId}`);
      const members = group.members.filter((m: any) => m.user_id !== group.owner_id);
      if (members.length === 0) { Alert.alert('No Members', 'There are no other members to transfer ownership to'); return; }
      if (Platform.OS === 'ios') {
        const options = [...members.map((m: any) => m.username), 'Cancel'];
        const cancelButtonIndex = options.length - 1;
        ActionSheetIOS.showActionSheetWithOptions(
          { title: 'Transfer Ownership', message: 'Select new owner', options, cancelButtonIndex },
          (buttonIndex) => { if (buttonIndex !== cancelButtonIndex) confirmTransfer(members[buttonIndex], client); }
        );
      } else {
        const buttons = members.map((member: any) => ({ text: member.username, onPress: () => confirmTransfer(member, client) }));
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
            navigation.navigate('Main');
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
            navigation.navigate('Main');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to delete group');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Group Name</Text>
          <TextInput
            style={styles.input}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Enter group name"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.helperText}>All members can update the group name</Text>
        </View>

        {isOwner && (
          <>
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Call Frequency</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segment, cadence === 'daily' && styles.segmentActive]}
                  onPress={() => handleCadenceChange('daily')}
                >
                  <Text style={[styles.segmentText, cadence === 'daily' && styles.segmentTextActive]}>Daily</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, cadence === 'weekly' && styles.segmentActive]}
                  onPress={() => handleCadenceChange('weekly')}
                >
                  <Text style={[styles.segmentText, cadence === 'weekly' && styles.segmentTextActive]}>Weekly</Text>
                </TouchableOpacity>
              </View>
              {cadence === 'daily' ? (
                <Text style={styles.helperText}>One call per day.</Text>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Calls per Week</Text>
                  <NumberPicker min={1} max={6} value={frequency} onChange={setFrequency} />
                </>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Call Window</Text>
              <Text style={styles.helperText}>
                Calls are scheduled at a random time within this window, in the group's timezone.
                {viewerTz !== groupTz ? ` For you: ${formatViewerWindow(windowStart, windowEnd, groupTz, viewerTz)}` : ''}
              </Text>
              <View style={styles.windowRow}>
                <View style={styles.windowCol}>
                  <Text style={[styles.fieldLabel, { marginBottom: spacing.sm }]}>Earliest</Text>
                  <NumberPicker min={0} max={22} value={windowStart} onChange={setWindowStart} formatValue={formatHour} />
                </View>
                <View style={styles.windowSep}>
                  <Text style={styles.windowDash}>—</Text>
                </View>
                <View style={styles.windowCol}>
                  <Text style={[styles.fieldLabel, { marginBottom: spacing.sm }]}>Latest</Text>
                  <NumberPicker min={1} max={23} value={windowEnd} onChange={setWindowEnd} formatValue={formatHour} />
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Call Duration</Text>
              <NumberPicker min={2} max={120} value={callDuration} onChange={setCallDuration} suffix="min" />
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Invite Link</Text>
              <TouchableOpacity
                style={[styles.shareButton, sharingLink && styles.shareButtonDisabled]}
                onPress={shareInviteLink}
                disabled={sharingLink}
              >
                {sharingLink ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.shareButtonText}>Share Invite Link</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.helperText}>Anyone with the link can join this group. Links expire in 7 days.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Ownership</Text>
              <TouchableOpacity style={styles.transferButton} onPress={transferOwnership}>
                <Text style={styles.transferButtonText}>Transfer Ownership</Text>
              </TouchableOpacity>
              <Text style={styles.helperText}>Pass ownership to another group member. You will become a regular member.</Text>
            </View>
          </>
        )}

        <View style={styles.card}>
          <View style={styles.muteRow}>
            <View style={styles.muteTextBlock}>
              <Text style={styles.muteLabel}>Mute Notifications</Text>
              <Text style={styles.muteHelper}>Stop receiving call alerts for this group</Text>
            </View>
            <Switch
              value={isMuted}
              onValueChange={toggleMute}
              trackColor={{ false: colors.background, true: colors.primary + '60' }}
              thumbColor={isMuted ? colors.primary : colors.textTertiary}
            />
          </View>
        </View>

        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>{isOwner ? 'Danger Zone' : 'Leave Group'}</Text>
          {!isOwner && (
            <>
              <TouchableOpacity style={styles.dangerButton} onPress={leaveGroup}>
                <Text style={styles.dangerButtonText}>Leave Group</Text>
              </TouchableOpacity>
              <Text style={styles.dangerHelperText}>You'll need to be re-invited to rejoin this group.</Text>
            </>
          )}
          {isOwner && (
            <>
              <TouchableOpacity style={styles.dangerButton} onPress={deleteGroup}>
                <Text style={styles.dangerButtonText}>Delete Group</Text>
              </TouchableOpacity>
              <Text style={styles.dangerHelperText}>This removes all members and call history. Cannot be undone.</Text>
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
          onPress={saveSettings}
          activeOpacity={0.85}
          disabled={!hasChanges}
        >
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: any, typography: any, shadow: any) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingBottom: spacing.xl },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.md, ...shadow.sm },
    fieldLabel: { ...typography.captionMedium, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600', marginBottom: spacing.sm },
    input: { backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 16, color: colors.text },
    helperText: { ...typography.small, color: colors.textTertiary, marginTop: spacing.sm, marginBottom: spacing.sm },
    windowRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
    windowCol: { flex: 1 },
    windowSep: { width: 32, alignItems: 'center', paddingTop: 28 },
    windowDash: { ...typography.body, color: colors.textTertiary },
    segmentRow: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: radius.md, padding: 3 },
    segment: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.sm, alignItems: 'center' },
    segmentActive: { backgroundColor: colors.surface, ...shadow.sm },
    segmentText: { ...typography.captionMedium, color: colors.textSecondary, fontWeight: '600' },
    segmentTextActive: { color: colors.primary },
    muteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    muteTextBlock: { flex: 1, marginRight: spacing.md },
    muteLabel: { ...typography.bodyMedium, color: colors.text, fontWeight: '600' },
    muteHelper: { ...typography.small, color: colors.textTertiary, marginTop: 2 },
    shareButton: { backgroundColor: colors.primaryLight, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.primary, minHeight: 40, justifyContent: 'center' },
    shareButtonDisabled: { opacity: 0.5 },
    shareButtonText: { ...typography.captionMedium, color: colors.primary, fontWeight: '700' },
    transferButton: { backgroundColor: colors.warningLight, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.warning },
    transferButtonText: { ...typography.captionMedium, color: colors.warning, fontWeight: '700' },
    footer: { backgroundColor: colors.background, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surface },
    saveButton: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.md + 2, alignItems: 'center', ...shadow.lg },
    saveButtonDisabled: { backgroundColor: colors.textTertiary, shadowOpacity: 0, elevation: 0 },
    saveButtonText: { ...typography.bodySemibold, color: '#fff' },
    dangerCard: { backgroundColor: colors.dangerLight, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.danger, marginBottom: spacing.xl },
    dangerTitle: { ...typography.captionMedium, color: colors.danger, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginBottom: spacing.md },
    dangerButton: { backgroundColor: colors.danger, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
    dangerButtonText: { ...typography.captionMedium, color: '#fff', fontWeight: '700' },
    dangerHelperText: { ...typography.small, color: colors.dangerDark, marginTop: spacing.sm, textAlign: 'center' },
  });
}
