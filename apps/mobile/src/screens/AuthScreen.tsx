import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { ApiClient } from '@orbit/shared';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';

import { API_URL } from '../config';
const client = new ApiClient(API_URL, () => null);

export default function AuthScreen() {
  const { onLogin } = useAuth();

  const [phone, setPhone] = useState('+1');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<'phone' | 'verify'>('phone');

  const requestOtp = async () => {
    try {
      console.log('Requesting OTP for phone:', phone);
      console.log('API URL:', API_URL);
      await client.request('POST', '/auth/request-otp', { phone });
      Alert.alert('Success', 'Code sent! (In dev mode, use any 6-digit code)');
      setStep('verify');
    } catch (error) {
      console.error('Request OTP error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', `Failed to send code: ${errorMessage}`);
    }
  };

  const verifyOtp = async () => {
    try {
      console.log('Verifying OTP...', { phone, code, username });
      const response = await client.request<{ access_token: string; refresh_token: string }>(
        'POST', '/auth/verify-otp', { phone, code, username }
      );
      console.log('OTP verified, saving tokens...');
      await SecureStore.setItemAsync('access_token', response.access_token);
      if (response.refresh_token) {
        await SecureStore.setItemAsync('refresh_token', response.refresh_token);
      }
      console.log('Tokens saved successfully');
      onLogin();
    } catch (error) {
      console.error('Verify OTP error:', error);
      Alert.alert('Error', `Invalid code or username taken: ${error}`);
    }
  };

  if (step === 'verify') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter Code</Text>
        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
        />
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.button} onPress={verifyOtp}>
          <Text style={styles.buttonText}>Verify</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setStep('phone')}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orbit</Text>
      <Text style={styles.subtitle}>Sign in with your phone number</Text>
      <TextInput
        style={styles.input}
        placeholder="+1234567890"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TouchableOpacity style={styles.button} onPress={requestOtp}>
        <Text style={styles.buttonText}>Send Code</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 15,
  },
});
