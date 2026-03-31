import React, { useState, useMemo } from 'react';
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
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

type InviteUserRouteProp = RouteProp<RootStackParamList, 'InviteUser'>;
type InviteUserNavigationProp = StackNavigationProp<RootStackParamList, 'InviteUser'>;

interface User { id: string; username: string; }

export default function InviteUserScreen() {
  const route = useRoute<InviteUserRouteProp>();
  const navigation = useNavigation<InviteUserNavigationProp>();
  const { groupId } = route.params;
  const { theme: { colors, typography, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, typography, shadow), [colors]);

  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sendingInviteTo, setSendingInviteTo] = useState<string | null>(null);

  const searchUsers = async (query: string) => {
    if (query.length < 2) { setUsers([]); return; }
    setIsSearching(true);
    try {
      const client = await createAuthenticatedApiClient();
      const result = await client.searchUsers(query, groupId);
      setUsers(result.users);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  React.useEffect(() => {
    const timeoutId = setTimeout(() => { searchUsers(searchQuery); }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const sendInvite = async (username: string) => {
    setSendingInviteTo(username);
    try {
      const client = await createAuthenticatedApiClient();
      await client.inviteUserToGroup(groupId, username);
      Alert.alert('Invitation Sent', `${username} has been invited to the group`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invitation');
    } finally {
      setSendingInviteTo(null);
    }
  };

  const renderUser = ({ item }: { item: User }) => {
    const isSending = sendingInviteTo === item.username;
    return (
      <View style={styles.userRow}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{item.username.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.username}>{item.username}</Text>
        <TouchableOpacity
          style={[styles.inviteButton, isSending && styles.inviteButtonDisabled]}
          onPress={() => sendInvite(item.username)}
          disabled={isSending}
          activeOpacity={0.8}
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
      <View style={styles.searchCard}>
        <Ionicons name="search" size={20} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username…"
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {isSearching && <ActivityIndicator color={colors.primary} size="small" />}
      </View>

      {!isSearching && searchQuery.length < 2 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={40} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
          <Text style={styles.emptyText}>Type at least 2 characters to search</Text>
        </View>
      )}

      {!isSearching && searchQuery.length >= 2 && users.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="person-remove-outline" size={40} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
          <Text style={styles.emptyText}>No users found for "{searchQuery}"</Text>
        </View>
      )}

      {users.length > 0 && (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function makeStyles(colors: any, typography: any, shadow: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    searchCard: { backgroundColor: colors.surface, margin: spacing.xl, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, ...shadow.sm },
    searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 4 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
    emptyText: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
    list: { flex: 1 },
    listContent: { paddingHorizontal: spacing.xl, paddingBottom: 40 },
    userRow: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
    userAvatar: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
    userAvatarText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    username: { ...typography.bodyMedium, flex: 1 },
    inviteButton: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, minWidth: 72, alignItems: 'center' },
    inviteButtonDisabled: { backgroundColor: colors.textTertiary },
    inviteButtonText: { ...typography.captionMedium, color: '#fff', fontWeight: '700' },
  });
}
