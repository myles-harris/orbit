import { useRef, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { BottomActionBar } from '../components/BottomActionBar';
import { Display } from '../components/Display';
import { Icon } from '../components/Icon';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { promptDeleteAccount } from '../utils/deleteAccount';
import { PRIVACY_POLICY_URL, TERMS_VERSION } from '../legal';
import { layout, radius } from '../theme';

/**
 * Shown once, before Home, to an account whose accepted policy version is below
 * TERMS_VERSION (AuthContext decides). Log out and Delete account are the ways out
 * for anyone who cannot accept.
 */
export default function AcceptTermsScreen() {
  const { onLogout, onAccountDeleted, onTermsAccepted } = useAuth();
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const saving = useRef(false);

  const accept = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      const client = await createAuthenticatedApiClient();
      await client.post('/me/accept-terms', { version: TERMS_VERSION, age_confirmed: true });
      onTermsAccepted();
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
    } finally {
      saving.current = false;
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]}>
        <Display size={30} leading={1.1}>Orbit is now 18+</Display>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          We updated our Privacy Policy. Orbit is for people 18 and older, so confirm your age to keep using it.
        </Text>
        <Text
          style={[styles.link, { color: colors.text }]}
          onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }}
          accessibilityRole="link"
        >
          Read the Privacy Policy
        </Text>
        <TouchableOpacity
          onPress={() => setAgeConfirmed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ageConfirmed }}
          accessibilityLabel="I'm 18 or older and agree to the Privacy Policy"
          style={styles.checkRow}
        >
          <View style={[styles.checkBox, { borderColor: colors.text }, ageConfirmed && { backgroundColor: colors.text }]}>
            {ageConfirmed && <Icon name="check" size={14} color={colors.background} />}
          </View>
          <Text style={[styles.checkLabel, { color: colors.text }]}>I'm 18 or older and agree to the Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLogout} accessibilityRole="button" style={styles.textButton}>
          <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Log out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => promptDeleteAccount(onAccountDeleted)}
          accessibilityRole="button"
          style={styles.textButton}
        >
          <Text style={[styles.textButtonLabel, { color: colors.danger }]}>Delete account</Text>
        </TouchableOpacity>
      </ScrollView>
      <BottomActionBar label="Continue" onPress={accept} disabled={!ageConfirmed} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.screenPad, paddingBottom: 24 },
  body: { marginTop: 16, fontFamily: 'Gelasio_400Regular', fontSize: 16, lineHeight: 24 },
  link: { marginTop: 16, fontFamily: 'Geist_500Medium', fontSize: 16, textDecorationLine: 'underline' },
  checkRow: { marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: layout.touchMin },
  checkBox: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1, fontFamily: 'Geist_500Medium', fontSize: 15 },
  textButton: { marginTop: 20, minHeight: layout.touchMin, justifyContent: 'center' },
  textButtonLabel: { fontFamily: 'Geist_500Medium', fontSize: 15 },
});
