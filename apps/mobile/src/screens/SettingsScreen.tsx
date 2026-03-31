import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserDTO } from '@orbit/shared';
import { useAuth } from '../context/AuthContext';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function SettingsScreen() {
  const { onLogout } = useAuth();
  const { theme: { colors, shadow }, mode, toggleTheme } = useTheme();
  const [user, setUser] = useState<UserDTO | null>(null);

  const styles = useMemo(() => makeStyles(colors, shadow), [colors]);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const client = await createAuthenticatedApiClient();
      const userData = await client.get<UserDTO>('/me');
      setUser(userData);
    } catch (error: any) {
      if (error.message?.includes('401')) {
        Alert.alert('Session Expired', 'Please log in again.', [
          { text: 'Log In', onPress: () => onLogout() },
        ]);
      }
    }
  };

  const logout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: () => onLogout(),
      },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const initial = user.username.trim().charAt(0).toUpperCase();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.logoText}>orbit</Text>

      {/* Profile header */}
      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.username}>{user.username}</Text>
        <Text style={styles.phone}>{user.phone}</Text>
      </View>

      {/* Profile info */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Profile</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Username</Text>
            <Text style={styles.rowValue}>{user.username}</Text>
          </View>
          <View style={[styles.row, styles.rowBorderless]}>
            <Text style={styles.rowLabel}>Timezone</Text>
            <Text style={styles.rowValue}>{user.time_zone}</Text>
          </View>
        </View>
      </View>

      {/* Appearance toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBorderless]}>
            <Text style={styles.rowLabel}>Theme</Text>
            <View style={styles.themeToggle}>
              <TouchableOpacity
                style={[styles.themeOption, mode === 'dark' && styles.themeOptionActive]}
                onPress={() => mode !== 'dark' && toggleTheme()}
                activeOpacity={0.75}
              >
                <Ionicons name="moon" size={13} color={mode === 'dark' ? colors.primary : colors.textTertiary} />
                <Text style={[styles.themeOptionText, mode === 'dark' && styles.themeOptionTextActive]}>
                  Dark
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.themeOption, mode === 'light' && styles.themeOptionActive]}
                onPress={() => mode !== 'light' && toggleTheme()}
                activeOpacity={0.75}
              >
                <Ionicons name="sunny" size={13} color={mode === 'light' ? colors.primary : colors.textTertiary} />
                <Text style={[styles.themeOptionText, mode === 'light' && styles.themeOptionTextActive]}>
                  Light
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>App</Text>
            <Text style={styles.rowValue}>Orbit</Text>
          </View>
          <View style={[styles.row, styles.rowBorderless]}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>0.1.0</Text>
          </View>
        </View>
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.75}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: any, shadow: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    logoText: {
      fontFamily: 'Chango_400Regular',
      fontSize: 64,
      color: colors.text,
      textAlign: 'center',
      marginTop: 72,
      marginBottom: spacing.sm,
    },
    profileCard: {
      backgroundColor: colors.surface,
      margin: spacing.xl,
      borderRadius: radius.xl,
      padding: spacing.xxl,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarCircle: {
      width: 80, height: 80,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      borderWidth: 1.5,
      borderColor: colors.primaryDark,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: spacing.lg,
      ...shadow.lg,
    },
    avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
    username: {
      fontSize: 22,
      fontFamily: 'RobotoMono_700Bold',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    phone: {
      fontSize: 14,
      fontFamily: 'RobotoMono_400Regular',
      color: colors.textTertiary,
    },
    section: { marginHorizontal: spacing.xl, marginBottom: spacing.xl },
    sectionLabel: {
      fontSize: 12,
      fontFamily: 'RobotoMono_500Medium',
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowBorderless: { borderBottomWidth: 0 },
    rowLabel: {
      fontSize: 16,
      fontFamily: 'RobotoMono_400Regular',
      color: colors.textSecondary,
    },
    rowValue: {
      fontSize: 16,
      fontFamily: 'RobotoMono_500Medium',
      color: colors.text,
    },
    // ── Theme toggle ──
    themeToggle: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: radius.md,
      padding: 3,
      gap: 2,
    },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.sm,
    },
    themeOptionActive: {
      backgroundColor: colors.surface,
      ...shadow.sm,
    },
    themeOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textTertiary,
    },
    themeOptionTextActive: {
      color: colors.primary,
    },
    // ── Logout ──
    logoutButton: {
      borderRadius: radius.full,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
      backgroundColor: colors.dangerLight,
      borderWidth: 1.5,
      borderColor: colors.danger,
    },
    logoutButtonText: {
      fontSize: 16,
      fontFamily: 'RobotoMono_700Bold',
      color: '#d47070',
    },
  });
}
