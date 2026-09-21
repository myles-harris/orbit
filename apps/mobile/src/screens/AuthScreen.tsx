import { useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClient } from '@orbit/shared';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { setAccessToken } from '../utils/apiClient';
import { toE164 } from '../utils/phone';
import { API_URL } from '../config';
import { layout, onPhoto, radius, scrim } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { OrbitLogo } from '../components/OrbitLogo';
import { LightStatusBar } from '../components/LightStatusBar';

const signInSky = require('../../assets/signin-sky.jpg');

const client = new ApiClient(API_URL, () => null);

type Step = 'phone' | 'verify' | 'username';

// The mockup places the logo at y=112 under a 54pt status bar and the field block
// at y=330 under a 180pt logo box. Flow layout keeps both gaps and swaps the status
// bar for the real inset. The mark itself is 178.6 tall; it sits at the top of the slot.
const LOGO_TOP_GAP = 112 - 54;
const LOGO_SLOT = 180;
const FORM_TOP_GAP = 330 - (112 + LOGO_SLOT);
const SIDE_PAD = 28;
const FOOTER_MIN_BOTTOM = 26;
// The scrim's stops at 0 / 30% / 72% / 100% — expo-linear-gradient takes 0–1.
const SCRIM_LOCATIONS = [0, 0.3, 0.72, 1] as const;

// AuthScreen always overlays the sky photo, so cream and wheat are correct whatever
// the app's light/dark preference. The one screen where fixed colours are right;
// they come from `onPhoto` rather than being written out here.

export default function AuthScreen() {
  const { onLogin } = useAuth();
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();

  // The mockup draws `+1` as a label, but the field has always been editable, and the
  // server accepts any E.164 number — so it stays editable, in the drawn chrome.
  const [countryCode, setCountryCode] = useState('+1');
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [step, setStep] = useState<Step>('phone');

  // Whatever was typed or pasted — "(404) 555-0117", a whole "+44 7911 123456" — as E.164.
  const phone = toE164(countryCode, number);

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
        await setAccessToken(r.access_token);
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
        'POST', '/auth/complete-signup', {
          signup_token: signupToken,
          username: username.trim(),
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      );
      await setAccessToken(response.access_token);
      if (response.refresh_token) {
        await SecureStore.setItemAsync('refresh_token', response.refresh_token);
      }
      onLogin();
    } catch (error) {
      Alert.alert('Error', `Username unavailable or invalid: ${error}`);
    }
  };

  // The design draws only the phone step. The other two reuse its background,
  // scrim, logo, field and footer; only the label, the field's contents and the
  // button change.
  const action =
    step === 'phone' ? { label: 'Send code', onPress: requestOtp }
    : step === 'verify' ? { label: 'Verify', onPress: verifyOtp }
    : { label: 'Continue', onPress: submitUsername };

  return (
    <View style={styles.screen}>
      {/* Always over the sky, regardless of the app's mode — see the note above. */}
      <LightStatusBar />
      {/* The design's whole 9:16 sky, zoomed only as far as it takes to cover the screen and
          centred: a phone taller than 9:16 loses a little off each side and shows no bands. It
          is the mockup's `background-size: cover`. */}
      <Image source={signInSky} style={styles.sky} resizeMode="cover" />
      <LinearGradient
        colors={scrim.signIn}
        locations={SCRIM_LOCATIONS}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + LOGO_TOP_GAP, paddingBottom: Math.max(insets.bottom, FOOTER_MIN_BOTTOM) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoSlot}>
            <OrbitLogo />
          </View>

          <View style={styles.form}>
            {step === 'phone' ? (
              <>
                <Text style={styles.label}>Phone number</Text>
                <View style={styles.field}>
                  <TextInput
                    style={[styles.input, styles.prefix]}
                    value={countryCode}
                    onChangeText={setCountryCode}
                    keyboardType="phone-pad"
                    maxLength={4}
                    accessibilityLabel="Country code"
                    maxFontSizeMultiplier={1.3}
                  />
                  <View style={styles.divider} />
                  <TextInput
                    style={[styles.input, styles.value]}
                    placeholder="(678) 000-0000"
                    placeholderTextColor={onPhoto.field.placeholder}
                    value={number}
                    onChangeText={setNumber}
                    keyboardType="phone-pad"
                    accessibilityLabel="Phone number"
                    maxFontSizeMultiplier={1.3}
                  />
                </View>
                <Text style={styles.note}>Standard message rates apply.</Text>
              </>
            ) : step === 'verify' ? (
              <>
                <Text style={styles.label}>Verification code</Text>
                <View style={styles.field}>
                  <TextInput
                    key="otp-input"
                    style={[styles.input, styles.value]}
                    placeholder="000000"
                    placeholderTextColor={onPhoto.field.placeholder}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    accessibilityLabel="Verification code"
                    maxFontSizeMultiplier={1.3}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setStep('phone')}
                  accessibilityRole="button"
                  accessibilityLabel="Back to phone number"
                  hitSlop={8}
                >
                  <Text style={styles.note}>← Back</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>Username</Text>
                <View style={styles.field}>
                  <TextInput
                    key="username-input"
                    style={[styles.input, styles.value]}
                    placeholder="Choose a username"
                    placeholderTextColor={onPhoto.field.placeholder}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    accessibilityLabel="Username"
                    maxFontSizeMultiplier={1.3}
                  />
                </View>
              </>
            )}
          </View>

          <View style={styles.footer}>
            {/* Not yet tappable: there is no Terms or Privacy page to open. */}
            <Text style={styles.consent}>
              By continuing you agree to the{' '}
              <Text style={styles.consentLink}>Terms of Service</Text> and{' '}
              <Text style={styles.consentLink}>Privacy Policy</Text>.
            </Text>
            <TouchableOpacity
              onPress={action.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              // Marigold and its espresso label are the same in both themes, so reading
              // them from the theme keeps this screen identical in light and dark.
              style={[styles.button, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.buttonLabel, { color: colors.onAccent }]} maxFontSizeMultiplier={1.3}>
                {action.label}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: onPhoto.backdrop },
  flex: { flex: 1 },
  // React Native lays a bundled image out at its own pixel size unless width and height say
  // otherwise, and `absoluteFill`'s left/right/top/bottom do not: it left this photo 1170×2080
  // points big, pinned top left and cut off by the screen, whatever the resizeMode.
  sky: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  content: {
    flexGrow: 1,
    paddingHorizontal: SIDE_PAD,
  },
  logoSlot: { height: LOGO_SLOT, alignItems: 'center' },
  form: { marginTop: FORM_TOP_GAP },
  label: {
    fontFamily: 'Geist_500Medium',
    fontSize: 13,
    includeFontPadding: false,
    color: onPhoto.sub,
  },
  // A row of one or two TextInputs on glass. Height, not minHeight: the inputs
  // are single-line and centred, and their text is capped below.
  field: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: onPhoto.field.fill,
    borderWidth: 1,
    borderColor: onPhoto.field.border,
  },
  input: {
    padding: 0,
    fontFamily: 'GeistMono_500Medium',
    fontSize: 17,
    includeFontPadding: false,
  },
  prefix: { color: onPhoto.sub },
  value: {
    flex: 1,
    color: onPhoto.title,
    letterSpacing: 0.34, // 0.02em at 17pt; React Native takes points
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: onPhoto.field.divider,
  },
  note: {
    marginTop: 10,
    fontFamily: 'Gelasio_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: onPhoto.sub,
  },
  // `marginTop: 'auto'` pushes the footer to the bottom when the form is short; the
  // padding is its floor when the keyboard leaves no room to spare.
  footer: {
    marginTop: 'auto',
    paddingTop: 24,
  },
  consent: {
    marginBottom: 14,
    fontFamily: 'Gelasio_400Regular',
    fontSize: 12.5,
    lineHeight: 19,
    color: onPhoto.sub,
  },
  consentLink: {
    color: onPhoto.title,
    textDecorationLine: 'underline',
  },
  button: {
    minHeight: layout.primaryBtn,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 17,
    includeFontPadding: false,
  },
});
