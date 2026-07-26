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
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

type JoinInviteRouteProp = RouteProp<RootStackParamList, 'JoinInvite'>;
type JoinInviteNavigationProp = StackNavigationProp<RootStackParamList, 'JoinInvite'>;

export default function JoinInviteScreen() {
  const route = useRoute<JoinInviteRouteProp>();
  const navigation = useNavigation<JoinInviteNavigationProp>();
  const { code } = route.params;
  const { theme: { colors, typography, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, typography, shadow), [colors]);

  const [groupInfo, setGroupInfo] = useState<{ group_id: string; group_name: string; expires_at: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const loadInviteInfo = async () => {
      try {
        const client = await createAuthenticatedApiClient();
        const info = await client.getInviteInfo(code);
        setGroupInfo(info);
      } catch (error: any) {
        if (error.message?.includes('404')) {
          setLoadError('This invite link is invalid or has already been used.');
        } else if (error.message?.toLowerCase().includes('expired')) {
          setLoadError('This invite link has expired.');
        } else {
          setLoadError('Could not load invite details.');
        }
      }
    };
    loadInviteInfo();
  }, [code]);

  const joinGroup = async () => {
    if (!groupInfo) return;
    setJoining(true);
    try {
      const client = await createAuthenticatedApiClient();
      await client.joinGroupWithCode(groupInfo.group_id, code);
      navigation.replace('GroupDetail', { groupId: groupInfo.group_id });
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('already')) {
        navigation.replace('GroupDetail', { groupId: groupInfo.group_id });
      } else if (msg.includes('expired')) {
        Alert.alert('Invite Expired', 'This invite link has expired. Ask the group owner for a new one.');
      } else {
        Alert.alert('Error', 'Failed to join the group.');
      }
    } finally {
      setJoining(false);
    }
  };

  if (!groupInfo && !loadError) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const goHome = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  };

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

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>{groupInfo!.group_name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.groupName}>{groupInfo!.group_name}</Text>
        <Text style={styles.subText}>You've been invited to join this group on Orbit.</Text>

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
    groupName: { ...typography.h2, textAlign: 'center', marginBottom: spacing.md },
    subText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xxl },
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
