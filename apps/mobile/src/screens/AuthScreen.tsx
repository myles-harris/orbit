import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
const bgGradient = require('../../assets/background-gradient-4.png');
import { ApiClient } from '@orbit/shared';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

const client = new ApiClient(API_URL, () => null);

// AuthScreen always overlays the dark gradient image, so cream text is correct
// regardless of the app's light/dark mode preference.

function GlassButton({ label, onPress, style }: { label: string; onPress: () => void; style?: object }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.glassButtonOuter, style]} activeOpacity={0.75}>
      <Text style={styles.glassButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AuthScreen() {
  const { onLogin } = useAuth();
  useTheme(); // subscribe to ensure context is available, but we use fixed cream styles

  const [phone, setPhone] = useState('+1');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [mode, setMode] = useState<'signup' | 'login' | null>(null);
  const [step, setStep] = useState<'choose' | 'phone' | 'verify' | 'username'>('choose');

  const requestOtp = async () => {
    try {
      await client.request('POST', '/auth/request-otp', { phone });
      Alert.alert('Code Sent', 'Check your messages for a 6-digit code.');
      setStep('verify');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', `Failed to send code: ${errorMessage}`);
    }
  };

  const verifyOtp = async () => {
    try {
      const response = await client.request<
        | { is_new_user: true; signup_token: string }
        | { is_new_user: false; access_token: string; refresh_token: string }
      >('POST', '/auth/verify-otp', { phone, code });
      if (response.is_new_user) {
        setSignupToken(response.signup_token);
        setStep('username');
      } else {
        const r = response as { access_token: string; refresh_token: string };
        await SecureStore.setItemAsync('access_token', r.access_token);
        if (r.refresh_token) {
          await SecureStore.setItemAsync('refresh_token', r.refresh_token);
        }
        onLogin();
      }
    } catch (error) {
      Alert.alert('Error', `Invalid code: ${error}`);
    }
  };

  const submitUsername = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username.');
      return;
    }
    try {
      const response = await client.request<{ access_token: string; refresh_token: string }>(
        'POST', '/auth/complete-signup', { signup_token: signupToken, username: username.trim() }
      );
      await SecureStore.setItemAsync('access_token', response.access_token);
      if (response.refresh_token) {
        await SecureStore.setItemAsync('refresh_token', response.refresh_token);
      }
      onLogin();
    } catch (error) {
      Alert.alert('Error', `Username unavailable or invalid: ${error}`);
    }
  };

  return (
    <View style={[styles.flex, { overflow: 'hidden' }]}>
      <Image source={bgGradient} style={styles.bgImage} resizeMode="cover" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandContainer}>
            <Text style={styles.logoText}>orbit</Text>
          </View>

          <View style={styles.card}>
            {step === 'choose' ? (
              <>
                <GlassButton label="Create Account" onPress={() => { setMode('signup'); setStep('phone'); }} />
                <GlassButton label="Log In" onPress={() => { setMode('login'); setStep('phone'); }} style={{ marginTop: spacing.md }} />
              </>
            ) : step === 'phone' ? (
              <>
                <Text style={styles.fieldLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor="rgba(230, 221, 200, 0.45)"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
                <GlassButton label="Send Code" onPress={requestOtp} />
                <TouchableOpacity style={styles.linkButton} onPress={() => setStep('choose')}>
                  <Text style={styles.linkText}>← Back</Text>
                </TouchableOpacity>
              </>
            ) : step === 'verify' ? (
              <>
                <Text style={styles.fieldLabel}>Verification Code</Text>
                <TextInput
                  key="otp-input"
                  style={[styles.input, styles.codeInput]}
                  placeholder="000000"
                  placeholderTextColor="rgba(230, 221, 200, 0.45)"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <GlassButton label="Verify & Continue" onPress={verifyOtp} />
                <TouchableOpacity style={styles.linkButton} onPress={() => setStep('phone')}>
                  <Text style={styles.linkText}>← Back</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput
                  key="username-input"
                  style={styles.input}
                  placeholder="Choose a username"
                  placeholderTextColor="rgba(230, 221, 200, 0.45)"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                <GlassButton label="Create Account" onPress={submitUsername} />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// AuthScreen styles are static (always over the dark gradient image)
const CREAM = '#e6ddc8';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bgImage: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '150%',
    height: '150%',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    paddingBottom: 60,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  logoText: {
    fontFamily: 'Chango_400Regular',
    fontSize: 80,
    color: CREAM,
    marginBottom: spacing.lg,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'RobotoMono_400Regular',
    color: CREAM,
    textAlign: 'center',
  },
  card: {
    padding: spacing.xxl,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: 'RobotoMono_500Medium',
    color: CREAM,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    fontFamily: 'RobotoMono_400Regular',
    color: CREAM,
    marginBottom: spacing.md,
  },
  codeInput: {
    fontSize: 24,
    fontFamily: 'RobotoMono_700Bold',
    textAlign: 'center',
    letterSpacing: 8,
  },
  glassButtonOuter: {
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.sm,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  glassButtonText: {
    fontSize: 16,
    fontFamily: 'RobotoMono_700Bold',
    fontWeight: '700',
    color: CREAM,
  },
  linkButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    fontFamily: 'RobotoMono_500Medium',
    color: CREAM,
  },
});
