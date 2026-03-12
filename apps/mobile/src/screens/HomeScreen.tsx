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
  const [invitationCount, setInvitationCount] = useState(0);

  const loadGroups = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const response = await client.get<{ groups: GroupDTO[] }>('/groups');
      setGroups(response.groups);
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  const loadInvitationCount = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const result = await client.getMyInvitations();
      setInvitationCount(result.invitations.length);
    } catch (error) {
      console.error('Failed to load invitation count:', error);
    }
  };

  useEffect(() => {
    loadGroups();
    loadInvitationCount();

    // Refresh invitations when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      loadInvitationCount();
      loadGroups();
    });

    return unsubscribe;
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGroups();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {invitationCount > 0 && (
        <TouchableOpacity
          style={styles.invitationBanner}
          onPress={() => navigation.navigate('Invitations')}
        >
          <Text style={styles.invitationBannerText}>
            You have {invitationCount} pending invitation{invitationCount > 1 ? 's' : ''}
          </Text>
          <Text style={styles.invitationBannerArrow}>→</Text>
        </TouchableOpacity>
      )}
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
  invitationBanner: {
    backgroundColor: '#007AFF',
    padding: 15,
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  invitationBannerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  invitationBannerArrow: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
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
