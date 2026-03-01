import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { GroupDTO } from '@orbit/shared';

import { createAuthenticatedApiClient } from '../utils/apiClient';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Main'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadGroups = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const response = await client.get<{ groups: GroupDTO[] }>('/groups');
      setGroups(response.groups);
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGroups();
    setRefreshing(false);
  };

  const joinWithCode = () => {
    Alert.prompt(
      'Join Group',
      'Enter the invite code shared by the group owner:',
      async (inviteCode) => {
        if (!inviteCode || inviteCode.trim().length === 0) {
          return;
        }

        try {
          const client = await createAuthenticatedApiClient();
          const code = inviteCode.trim().toUpperCase();

          // First, we need to validate the invite and get the group ID
          // We'll use a special endpoint or get all groups and search
          // For now, let's call a validation endpoint that returns group info
          const inviteInfo = await client.get<any>(`/groups/invites/${code}/info`);

          // Now join using the group ID
          await client.post<any>(`/groups/${inviteInfo.group_id}/join`, {
            invite_code: code,
          });

          Alert.alert('Success', `You've joined the group!`);
          await loadGroups(); // Refresh the list
        } catch (error: any) {
          Alert.alert('Error', error.message || 'Invalid invite code or already a member');
        }
      },
      'plain-text'
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.groupCard}
            onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
          >
            <Text style={styles.groupName}>{item.name}</Text>
            <Text style={styles.groupInfo}>
              {item.cadence === 'daily' ? 'Daily' : `${item.weekly_frequency}x/week`} • {item.member_count} members
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No groups yet</Text>
            <Text style={styles.emptySubtext}>Create or join a group to get started</Text>
          </View>
        }
      />
      <TouchableOpacity
        style={styles.joinCodeButton}
        onPress={joinWithCode}
      >
        <Text style={styles.joinCodeButtonText}>Join with Code</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateGroup')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  groupCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 5,
  },
  groupInfo: {
    fontSize: 14,
    color: '#666',
  },
  empty: {
    alignItems: 'center',
    marginTop: 100,
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  joinCodeButton: {
    position: 'absolute',
    left: 20,
    bottom: 20,
    backgroundColor: '#34C759',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  joinCodeButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
  },
});
