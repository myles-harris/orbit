import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Share } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import * as Clipboard from 'expo-clipboard';

import { createAuthenticatedApiClient } from '../utils/apiClient';

type GroupDetailRouteProp = RouteProp<RootStackParamList, 'GroupDetail'>;
type GroupDetailNavigationProp = StackNavigationProp<RootStackParamList, 'GroupDetail'>;

export default function GroupDetailScreen() {
  const route = useRoute<GroupDetailRouteProp>();
  const navigation = useNavigation<GroupDetailNavigationProp>();
  const { groupId } = route.params;

  const [group, setGroup] = useState<any>(null);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadGroupDetails = async () => {
    try {
      const client = await createAuthenticatedApiClient();

      // Get current user info
      const userInfo = await client.get<any>('/me');
      setCurrentUserId(userInfo.id);

      const groupData = await client.get<any>(`/groups/${groupId}`);
      setGroup(groupData);

      // Check for active call
      const callData = await client.get<{ current: any }>(`/groups/${groupId}/calls/current`);
      setCurrentCall(callData.current);
    } catch (error) {
      console.error('Failed to load group:', error);
    }
  };

  useEffect(() => {
    loadGroupDetails();

    // Reload group details when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      loadGroupDetails();
    });

    // Poll for active calls every 10s so scheduled calls appear automatically
    const poll = setInterval(loadGroupDetails, 10000);

    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [groupId, navigation]);

  // Set up settings button once we have group data
  useEffect(() => {
    if (!group || !currentUserId) return;

    const isOwner = group.owner_id === currentUserId;

    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('GroupSettings', { groupId, isOwner })}
          style={{ marginRight: 15 }}
        >
          <Text style={{ fontSize: 18, color: '#007AFF' }}>⚙️</Text>
        </TouchableOpacity>
      ),
    });
  }, [group, currentUserId, groupId, navigation]);

  const startCall = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const call = await client.post<any>(`/groups/${groupId}/call-now`, {});

      // Get token to join
      const tokenData = await client.post<any>(`/groups/${groupId}/calls/${call.id}/join-token`, {});

      navigation.navigate('Call', {
        callId: call.id,
        groupId,
        roomUrl: tokenData.room_url,
        token: tokenData.token,
        endsAt: tokenData.ends_at ?? undefined,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start call');
    }
  };

  const joinCall = async () => {
    if (!currentCall) return;

    try {
      const client = await createAuthenticatedApiClient();
      const tokenData = await client.post<any>(`/groups/${groupId}/calls/${currentCall.id}/join-token`, {});

      navigation.navigate('Call', {
        callId: currentCall.id,
        groupId,
        roomUrl: tokenData.room_url,
        token: tokenData.token,
        endsAt: tokenData.ends_at ?? undefined,
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to join call');
    }
  };

  const removeMember = async (memberId: string, memberUsername: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberUsername} from the group?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const client = await createAuthenticatedApiClient();
              await client.delete(`/groups/${groupId}/members/${memberId}`);
              Alert.alert('Success', `${memberUsername} has been removed from the group`);
              await loadGroupDetails(); // Refresh the group details
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const isOwner = group?.owner_id === currentUserId;

  if (!group) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.groupName}>{group.name}</Text>
        <Text style={styles.info}>
          {group.cadence === 'daily' ? 'Daily calls' : `${group.weekly_frequency} calls/week`}
        </Text>
        <Text style={styles.info}>{group.call_duration_minutes} minutes per call</Text>
      </View>

      {currentCall ? (
        <View style={styles.activeCallBanner}>
          <Text style={styles.activeCallText}>Call in progress</Text>
          <TouchableOpacity style={styles.joinButton} onPress={joinCall}>
            <Text style={styles.joinButtonText}>Join Call</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.startButton} onPress={startCall}>
          <Text style={styles.startButtonText}>Start Call Now</Text>
        </TouchableOpacity>
      )}

      {isOwner && (
        <TouchableOpacity
          style={styles.inviteButton}
          onPress={() => navigation.navigate('InviteUser', { groupId })}
        >
          <Text style={styles.inviteButtonText}>Invite Member</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members ({group.member_count})</Text>
        {group.members.map((member: any) => (
          <View key={member.user_id} style={styles.memberRow}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberText}>{member.username}</Text>
              {member.role === 'owner' && (
                <Text style={styles.ownerBadge}>Owner</Text>
              )}
            </View>
            {isOwner && member.role !== 'owner' && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeMember(member.user_id, member.username)}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  info: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  activeCallBanner: {
    backgroundColor: '#4CAF50',
    padding: 15,
    margin: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeCallText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  joinButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  joinButtonText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: '#007AFF',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inviteButton: {
    backgroundColor: '#007AFF',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberText: {
    fontSize: 16,
  },
  ownerBadge: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  removeButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
