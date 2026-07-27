import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

type JoinInviteRouteProp = RouteProp<RootStackParamList, 'JoinInvite'>;
type JoinInviteNavigationProp = StackNavigationProp<RootStackParamList, 'JoinInvite'>;

interface InvitePreview {
  group_id: string;
  group_name: string;
  cadence: string;
  weekly_frequency: number | null;
  call_duration_minutes: number;
  member_count: number;
  invited_by: string;
  expires_at: string;
}

export default function JoinInviteScreen() {
  const route = useRoute<JoinInviteRouteProp>();
  const navigation = useNavigation<JoinInviteNavigationProp>();
  const { code } = route.params;
  const { isAuthenticated } = useAuth();
  const { theme: { colors, typography, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, typography, shadow), [colors]);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const loadPreview = async () => {
      try {
        const resp = await fetch(`${API_URL}/groups/invites/${encodeURIComponent(code)}/preview`);
        if (resp.status === 404) { setLoadError('This invite link is invalid.'); return; }
        if (resp.status === 410) {
          const body = await resp.json();
          if (body.error === 'invite_expired') setLoadError('This invite link has expired.');
          else if (body.error === 'invite_revoked') setLoadError('This invite link has been revoked.');
          else setLoadError('This invite link is no longer valid.');
          return;
        }
        if (!resp.ok) { setLoadError('Could not load invite details.'); return; }
        setPreview(await resp.json());
      } catch {
        setLoadError('Could not load invite details.');
      }
    };
    loadPreview();
  }, [code]);

  const joinGroup = async () => {
    if (!preview) return;
    setJoining(true);
    try {
      const client = await createAuthenticatedApiClient();
      await client.post(`/groups/${preview.group_id}/join`, { invite_code: code });
      navigation.replace('GroupDetail', { groupId: preview.group_id });
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('already')) {
        navigation.replace('GroupDetail', { groupId: preview.group_id });
      } else if (msg.includes('expired')) {
        Alert.alert('Invite Expired', 'This invite link has expired. Ask the group owner for a new one.');
      } else {
        Alert.alert('Error', 'Failed to join the group.');
      }
    } finally {
      setJoining(false);
    }
  };

  const signInToJoin = async () => {
    // Stash the invite code so AuthScreen can pick it up after sign-in
    await AsyncStorage.setItem('orbit.pendingInviteCode', code);
    navigation.navigate('Auth');
  };

  const goHome = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else if (isAuthenticated) navigation.replace('Main');
    else navigation.navigate('Auth');
  };

  if (!preview && !loadError) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Ionicons name="link-outline" size={48} color={colors.textTertiary} style={{ marginBottom: spacing.lg }} />
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity onPress={goHome} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cadenceLabel = preview!.cadence === 'daily'
    ? 'Daily calls'
    : `${preview!.weekly_frequency ?? 1} calls/week`;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>{preview!.group_name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.groupName}>{preview!.group_name}</Text>
        <Text style={styles.invitedBy}>Invited by {preview!.invited_by}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaBadge}>{cadenceLabel}</Text>
          <Text style={styles.metaBadge}>{preview!.call_duration_minutes} min</Text>
          <Text style={styles.metaBadge}>{preview!.member_count} members</Text>
        </View>

        {isAuthenticated ? (
          <TouchableOpacity
            style={[styles.joinButton, joining && styles.joinButtonDisabled]}
            onPress={joinGroup}
            disabled={joining}
            activeOpacity={0.85}
          >
            {joining ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.joinButtonText}>Join Group</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.joinButton}
            onPress={signInToJoin}
            activeOpacity={0.85}
          >
            <Text style={styles.joinButtonText}>Sign in to Join</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={goHome} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors: any, typography: any, shadow: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.xl },
    center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.xxl,
      alignItems: 'center',
      ...shadow.lg,
    },
    iconContainer: {
      width: 80, height: 80, borderRadius: radius.xl,
      backgroundColor: colors.primary,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: spacing.xl,
      ...shadow.md,
    },
    iconText: { fontSize: 36, fontWeight: '700', color: '#fff' },
    groupName: { ...typography.h2, textAlign: 'center', marginBottom: spacing.sm },
    invitedBy: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xxl },
    metaBadge: { ...typography.captionMedium, color: colors.textSecondary, backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
    joinButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingVertical: spacing.md + 2,
      paddingHorizontal: spacing.xxl * 2,
      marginBottom: spacing.lg,
      minWidth: 200,
      alignItems: 'center',
      ...shadow.md,
    },
    joinButtonDisabled: { backgroundColor: colors.textTertiary, shadowOpacity: 0, elevation: 0 },
    joinButtonText: { ...typography.bodySemibold, color: '#fff' },
    cancelText: { ...typography.body, color: colors.textTertiary, marginTop: spacing.sm },
    errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
    backButton: {
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
      borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    },
    backButtonText: { ...typography.captionMedium, color: colors.text, fontWeight: '600' },
  });
}
