import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';

type InviteUserRouteProp = RouteProp<RootStackParamList, 'InviteUser'>;
type InviteUserNavigationProp = StackNavigationProp<RootStackParamList, 'InviteUser'>;

interface User {
  id: string;
  username: string;
}

export default function InviteUserScreen() {
  const route = useRoute<InviteUserRouteProp>();
  const navigation = useNavigation<InviteUserNavigationProp>();
  const { groupId } = route.params;

  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sendingInviteTo, setSendingInviteTo] = useState<string | null>(null);

  // Debounce search
  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setUsers([]);
      return;
    }

    setIsSearching(true);
    try {
      const client = await createAuthenticatedApiClient();
      const result = await client.searchUsers(query, groupId);
      setUsers(result.users);
    } catch (error: any) {
      console.error('Search error:', error);
      Alert.alert('Error', error.message || 'Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search effect
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const sendInvite = async (username: string) => {
    setSendingInviteTo(username);
    try {
      const client = await createAuthenticatedApiClient();
      await client.inviteUserToGroup(groupId, username);

      Alert.alert(
        'Success',
        `Invitation sent to ${username}`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      console.error('Invite error:', error);
      Alert.alert('Error', error.message || 'Failed to send invitation');
    } finally {
      setSendingInviteTo(null);
    }
  };

  const renderUser = ({ item }: { item: User }) => {
    const isSending = sendingInviteTo === item.username;

    return (
      <View style={styles.userRow}>
        <Text style={styles.username}>{item.username}</Text>
        <TouchableOpacity
          style={[styles.inviteButton, isSending && styles.inviteButtonDisabled]}
          onPress={() => sendInvite(item.username)}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.inviteButtonText}>Invite</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      </View>

      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}

      {!isSearching && searchQuery.length < 2 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Enter at least 2 characters to search for users
          </Text>
        </View>
      )}

      {!isSearching && searchQuery.length >= 2 && users.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No users found</Text>
        </View>
      )}

      {users.length > 0 && (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          style={styles.userList}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchContainer: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  userList: {
    flex: 1,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  username: {
    fontSize: 16,
    fontWeight: '500',
  },
  inviteButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  inviteButtonDisabled: {
    backgroundColor: '#ccc',
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
