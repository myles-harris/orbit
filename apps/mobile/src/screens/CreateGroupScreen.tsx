import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

import { createAuthenticatedApiClient } from '../utils/apiClient';

type CreateGroupNavigationProp = StackNavigationProp<RootStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen() {
  const navigation = useNavigation<CreateGroupNavigationProp>();
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [weeklyFrequency, setWeeklyFrequency] = useState('2');
  const [duration, setDuration] = useState('30');

  const createGroup = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    try {
      console.log('[CreateGroup] Starting group creation...');

      const client = await createAuthenticatedApiClient();

      const data: any = {
        name: name.trim(),
        cadence,
        call_duration_minutes: parseInt(duration),
      };

      if (cadence === 'weekly') {
        data.weekly_frequency = parseInt(weeklyFrequency);
      }

      console.log('[CreateGroup] Sending request with data:', data);
      await client.post('/groups', data);
      console.log('[CreateGroup] Group created successfully!');
      Alert.alert('Success', 'Group created!');
      navigation.goBack();
    } catch (error: any) {
      console.error('[CreateGroup] Error creating group:', error);
      Alert.alert('Error', error.message || 'Failed to create group');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.label}>Group Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Saturday Crew"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Call Schedule</Text>
        <View style={styles.radioGroup}>
          <TouchableOpacity
            style={[styles.radio, cadence === 'daily' && styles.radioSelected]}
            onPress={() => setCadence('daily')}
          >
            <Text style={[styles.radioText, cadence === 'daily' && styles.radioTextSelected]}>
              Daily
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.radio, cadence === 'weekly' && styles.radioSelected]}
            onPress={() => setCadence('weekly')}
          >
            <Text style={[styles.radioText, cadence === 'weekly' && styles.radioTextSelected]}>
              Weekly
            </Text>
          </TouchableOpacity>
        </View>

        {cadence === 'weekly' && (
          <>
            <Text style={styles.label}>Calls per Week</Text>
            <TextInput
              style={styles.input}
              placeholder="2"
              value={weeklyFrequency}
              onChangeText={setWeeklyFrequency}
              keyboardType="number-pad"
            />
          </>
        )}

        <Text style={styles.label}>Call Duration (minutes)</Text>
        <TextInput
          style={styles.input}
          placeholder="30"
          value={duration}
          onChangeText={setDuration}
          keyboardType="number-pad"
        />

        <TouchableOpacity style={styles.button} onPress={createGroup}>
          <Text style={styles.buttonText}>Create Group</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  radio: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
  },
  radioSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  radioText: {
    fontSize: 16,
    color: '#333',
  },
  radioTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
