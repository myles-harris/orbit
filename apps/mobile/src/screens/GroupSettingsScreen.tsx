import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch, ActionSheetIOS, Platform } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

import { createAuthenticatedApiClient } from '../utils/apiClient';

type GroupSettingsRouteProp = RouteProp<RootStackParamList, 'GroupSettings'>;
type GroupSettingsNavigationProp = StackNavigationProp<RootStackParamList, 'GroupSettings'>;

export default function GroupSettingsScreen() {
  const route = useRoute<GroupSettingsRouteProp>();
  const navigation = useNavigation<GroupSettingsNavigationProp>();
  const { groupId, isOwner } = route.params;

  const [groupName, setGroupName] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [weeklyFrequency, setWeeklyFrequency] = useState('3');
  const [callDuration, setCallDuration] = useState('15');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroupSettings();
  }, []);

  const loadGroupSettings = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const group = await client.get<any>(`/groups/${groupId}`);

      setGroupName(group.name);
      setCadence(group.cadence);
      setWeeklyFrequency(group.weekly_frequency?.toString() || '3');
      setCallDuration(group.call_duration_minutes.toString());
      setLoading(false);
    } catch (error) {
      console.error('Failed to load group settings:', error);
      Alert.alert('Error', 'Failed to load group settings');
    }
  };

  const saveSettings = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Group name cannot be empty');
      return;
    }

    const duration = parseInt(callDuration);
    if (isNaN(duration) || duration < 5 || duration > 120) {
      Alert.alert('Error', 'Call duration must be between 5 and 120 minutes');
      return;
    }

    const frequency = parseInt(weeklyFrequency);
    if (cadence === 'weekly' && (isNaN(frequency) || frequency < 1 || frequency > 7)) {
      Alert.alert('Error', 'Weekly frequency must be between 1 and 7');
      return;
    }

    try {
      const client = await createAuthenticatedApiClient();

      const updates: any = {
        name: groupName.trim(),
      };

      // Only owner can update cadence and duration
      if (isOwner) {
        updates.cadence = cadence;
        updates.call_duration_minutes = duration;

        if (cadence === 'weekly') {
          updates.weekly_frequency = frequency;
        }
      }

      await client.put(`/groups/${groupId}`, updates);

      Alert.alert('Success', 'Group settings updated');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update group settings');
    }
  };

  const confirmTransfer = async (member: any, client: any) => {
    Alert.alert(
      'Confirm Transfer',
      `Transfer ownership to ${member.username}? You will no longer be the owner.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.post(`/groups/${groupId}/transfer-ownership`, {
                new_owner_id: member.user_id
              });

              Alert.alert('Success', `Ownership transferred to ${member.username}`, [
                {
                  text: 'OK',
                  onPress: () => {
                    // Navigate back to force refresh
                    navigation.goBack();
                  }
                }
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to transfer ownership');
            }
          }
        }
      ]
    );
  };

  const transferOwnership = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const group = await client.get<any>(`/groups/${groupId}`);

      // Get list of members (excluding current owner by comparing user_id to owner_id)
      const members = group.members.filter((m: any) => m.user_id !== group.owner_id);

      if (members.length === 0) {
        Alert.alert('Error', 'There are no other members to transfer ownership to');
        return;
      }

      if (Platform.OS === 'ios') {
        // Use ActionSheetIOS on iOS
        const options = [...members.map((m: any) => m.username), 'Cancel'];
        const cancelButtonIndex = options.length - 1;

        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Transfer Ownership',
            message: 'Select new owner',
            options,
            cancelButtonIndex,
          },
          (buttonIndex) => {
            if (buttonIndex !== cancelButtonIndex) {
              const selectedMember = members[buttonIndex];
              confirmTransfer(selectedMember, client);
            }
          }
        );
      } else {
        // Use Alert on Android
        const buttons = members.map((member: any) => ({
          text: member.username,
          onPress: () => confirmTransfer(member, client)
        }));
        buttons.push({ text: 'Cancel', style: 'cancel' });

        Alert.alert('Transfer Ownership', 'Select new owner:', buttons as any);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load members');
    }
  };

  const leaveGroup = async () => {
    Alert.alert(
      'Leave Group',
      `Are you sure you want to leave "${groupName}"? You will need to be re-invited to rejoin.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              const client = await createAuthenticatedApiClient();
              await client.post(`/groups/${groupId}/leave`, {});

              Alert.alert('Success', 'You have left the group');

              // Navigate back to Main screen (home)
              navigation.navigate('Main');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to leave group');
            }
          },
        },
      ]
    );
  };

  const deleteGroup = async () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"? This action cannot be undone and will remove all members and call history.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const client = await createAuthenticatedApiClient();
              await client.delete(`/groups/${groupId}`);

              Alert.alert('Success', 'Group has been deleted');

              // Navigate back to Main screen (home)
              navigation.navigate('Main');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Group Name</Text>
        <TextInput
          style={styles.input}
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Enter group name"
        />
        <Text style={styles.helperText}>All members can change the group name</Text>
      </View>

      {isOwner && (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>Call Frequency</Text>
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segment, cadence === 'daily' && styles.segmentActive]}
                onPress={() => setCadence('daily')}
              >
                <Text style={[styles.segmentText, cadence === 'daily' && styles.segmentTextActive]}>
                  Daily
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, cadence === 'weekly' && styles.segmentActive]}
                onPress={() => setCadence('weekly')}
              >
                <Text style={[styles.segmentText, cadence === 'weekly' && styles.segmentTextActive]}>
                  Weekly
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {cadence === 'weekly' && (
            <View style={styles.section}>
              <Text style={styles.label}>Calls per Week</Text>
              <TextInput
                style={styles.input}
                value={weeklyFrequency}
                onChangeText={setWeeklyFrequency}
                keyboardType="number-pad"
                placeholder="1-7"
              />
              <Text style={styles.helperText}>Number of random calls per week (1-7)</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.label}>Call Duration (minutes)</Text>
            <TextInput
              style={styles.input}
              value={callDuration}
              onChangeText={setCallDuration}
              keyboardType="number-pad"
              placeholder="5-120"
            />
            <Text style={styles.helperText}>Duration of each call (5-120 minutes)</Text>
          </View>

          <Text style={styles.ownerNote}>Only group owner can change frequency and duration</Text>

          <View style={styles.section}>
            <Text style={styles.label}>Transfer Ownership</Text>
            <TouchableOpacity style={styles.transferButton} onPress={transferOwnership}>
              <Text style={styles.transferButtonText}>Transfer Ownership</Text>
            </TouchableOpacity>
            <Text style={styles.helperText}>
              Transfer ownership to another group member. You will no longer be the owner.
            </Text>
          </View>
        </>
      )}

      <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
        <Text style={styles.saveButtonText}>Save Changes</Text>
      </TouchableOpacity>

      {!isOwner && (
        <View style={styles.dangerZone}>
          <Text style={styles.dangerZoneTitle}>Leave Group</Text>
          <TouchableOpacity style={styles.leaveButton} onPress={leaveGroup}>
            <Text style={styles.leaveButtonText}>Leave Group</Text>
          </TouchableOpacity>
          <Text style={styles.dangerZoneWarning}>
            You will need to be re-invited to rejoin this group.
          </Text>
        </View>
      )}

      {isOwner && (
        <View style={styles.dangerZone}>
          <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={deleteGroup}>
            <Text style={styles.deleteButtonText}>Delete Group</Text>
          </TouchableOpacity>
          <Text style={styles.dangerZoneWarning}>
            Deleting this group will remove all members and call history. This action cannot be undone.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  helperText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  segment: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  segmentActive: {
    backgroundColor: '#007AFF',
  },
  segmentText: {
    fontSize: 16,
    color: '#007AFF',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  ownerNote: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20,
    paddingHorizontal: 20,
  },
  transferButton: {
    backgroundColor: '#FF9500',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  transferButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    margin: 20,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerZone: {
    margin: 20,
    marginTop: 40,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 8,
    backgroundColor: '#FFF5F5',
  },
  dangerZoneTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 15,
  },
  leaveButton: {
    backgroundColor: '#FF9500',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerZoneWarning: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
});
