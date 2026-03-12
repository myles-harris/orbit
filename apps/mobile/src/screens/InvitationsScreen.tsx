import React, { useEffect, useState } from 'react';
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

type InvitationsNavigationProp = StackNavigationProp<RootStackParamList, 'Invitations'>;

interface Invitation {
  id: string;
  group: {
    id: string;
    name: string;
    cadence: string;
    weekly_frequency: number | null;
    call_duration_minutes: number;
    member_count: number;
  };
  invited_by: string;
  created_at: string;
  expires_at: string;
}

export default function InvitationsScreen() {
  const navigation = useNavigation<InvitationsNavigationProp>();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const loadInvitations = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const client = await createAuthenticatedApiClient();
      const result = await client.getMyInvitations();
      setInvitations(result.invitations);
    } catch (error: any) {
      console.error('Load invitations error:', error);
      Alert.alert('Error', error.message || 'Failed to load invitations');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadInvitations();
  }, []);

  const respondToInvite = async (inviteId: string, action: 'accept' | 'decline' | 'dismiss') => {
    setRespondingTo(inviteId);
    try {
      const client = await createAuthenticatedApiClient();
      const result = await client.respondToInvitation(inviteId, action);

      if (action === 'accept') {
        Alert.alert(
          'Success',
          `You joined ${result.group?.name}!`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Navigate back to home to see the new group
                navigation.navigate('Main');
              },
            },
          ]
        );
      } else if (action === 'decline') {
        Alert.alert('Invitation Declined', 'You declined the invitation');
      } else {
        Alert.alert('Dismissed', 'You can respond to this invitation later');
      }

      // Reload invitations after responding
      loadInvitations();
    } catch (error: any) {
      console.error('Respond error:', error);
      Alert.alert('Error', error.message || 'Failed to respond to invitation');
    } finally {
      setRespondingTo(null);
    }
  };

  const getCadenceText = (invitation: Invitation) => {
    if (invitation.group.cadence === 'daily') {
      return 'Daily calls';
    }
    return `${invitation.group.weekly_frequency} calls/week`;
  };

  const renderInvitation = ({ item }: { item: Invitation }) => {
    const isResponding = respondingTo === item.id;

    return (
      <View style={styles.inviteCard}>
        <View style={styles.inviteHeader}>
          <Text style={styles.groupName}>{item.group.name}</Text>
          <Text style={styles.invitedBy}>from {item.invited_by}</Text>
        </View>

        <View style={styles.inviteDetails}>
          <Text style={styles.detailText}>{getCadenceText(item)}</Text>
          <Text style={styles.detailText}>
            {item.group.call_duration_minutes} min per call
          </Text>
          <Text style={styles.detailText}>
            {item.group.member_count} {item.group.member_count === 1 ? 'member' : 'members'}
          </Text>
        </View>

        {isResponding ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#007AFF" />
          </View>
        ) : (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => respondToInvite(item.id, 'accept')}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.dismissButton]}
              onPress={() => respondToInvite(item.id, 'dismiss')}
            >
              <Text style={styles.dismissButtonText}>Later</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={() => respondToInvite(item.id, 'decline')}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (invitations.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No pending invitations</Text>
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
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadInvitations(true)} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  listContent: {
    padding: 15,
  },
  inviteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inviteHeader: {
    marginBottom: 12,
  },
  groupName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  invitedBy: {
    fontSize: 14,
    color: '#666',
  },
  inviteDetails: {
    marginBottom: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#34C759',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissButton: {
    backgroundColor: '#f0f0f0',
  },
  dismissButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  declineButton: {
    backgroundColor: '#FF3B30',
  },
  declineButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 15,
    alignItems: 'center',
  },
});
