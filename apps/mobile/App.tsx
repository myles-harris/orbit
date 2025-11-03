import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ApiClient } from '@orbit/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:4000';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    SecureStore.getItemAsync('access_token').then(setToken);
    AsyncStorage.getItem('groups_cache').then(json => {
      if (json) setGroups(JSON.parse(json));
    });
  }, []);

  const api = useMemo(() => new ApiClient(API_BASE, () => token), [token]);

  const requestOtp = async () => {
    await api.request('POST', '/auth/request-otp', { phone, username });
  };

  const verifyOtp = async () => {
    const res = await api.request<any>('POST', '/auth/verify-otp', { phone, code, username });
    setToken(res.access_token);
    await SecureStore.setItemAsync('access_token', res.access_token);
  };

  const loadGroups = async () => {
    const res = await api.request<any>('GET', '/groups');
    setGroups(res.groups || []);
    await AsyncStorage.setItem('groups_cache', JSON.stringify(res.groups || []));
  };

  if (!token) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '600' }}>Orbit</Text>
        <Text>Phone</Text>
        <TextInput value={phone} onChangeText={setPhone} placeholder="+1..." style={{ borderWidth: 1, padding: 8, borderRadius: 6 }} />
        <Text>Username</Text>
        <TextInput value={username} onChangeText={setUsername} placeholder="your name" style={{ borderWidth: 1, padding: 8, borderRadius: 6 }} />
        <Button title="Request OTP" onPress={requestOtp} />
        <Text>Code</Text>
        <TextInput value={code} onChangeText={setCode} placeholder="123456" style={{ borderWidth: 1, padding: 8, borderRadius: 6 }} />
        <Button title="Verify & Sign In" onPress={verifyOtp} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>Groups</Text>
        <Button title="Refresh" onPress={loadGroups} />
      </View>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={{ padding: 16, borderBottomWidth: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.name}</Text>
            <Text>{item.cadence}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ padding: 16 }}>No groups yet.</Text>}
      />
    </SafeAreaView>
  );
}

