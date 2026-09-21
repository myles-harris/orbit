import { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Localization from 'expo-localization';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { CadenceFields } from '../components/CadenceFields';
import { CallWindowField } from '../components/CallWindowField';
import { TextField } from '../components/Field';
import { FormScreen } from '../components/FormScreen';

type CreateGroupNavigationProp = StackNavigationProp<RootStackParamList, 'CreateGroup'>;

// Group Settings, derived: the same shell, name field, cadence fields and call-window
// block, in the order name → cadence → frequency → duration → call window. Nothing
// here is drawn twice — each is one shared component.
export default function CreateGroupScreen() {
  const navigation = useNavigation<CreateGroupNavigationProp>();

  const [name, setName] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [frequency, setFrequency] = useState(1);
  const [duration, setDuration] = useState(5);
  const [windowStart, setWindowStart] = useState(6);
  const [windowEnd, setWindowEnd] = useState(22);
  const [dialDragging, setDialDragging] = useState(false);

  // The window is in the creator's own zone, which becomes the group's.
  const deviceTz = Localization.getCalendars()[0]?.timeZone;

  const createGroup = async () => {
    if (!name.trim()) { Alert.alert('Missing Name', 'Please enter a group name'); return; }
    try {
      const client = await createAuthenticatedApiClient();
      const data: any = {
        name: name.trim(), cadence, call_duration_minutes: duration,
        call_window_start: windowStart, call_window_end: windowEnd,
        ...(deviceTz ? { time_zone: deviceTz } : {}),
      };
      if (cadence === 'daily') data.daily_frequency = 1;
      else data.weekly_frequency = frequency;
      await client.post('/groups', data);
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create group');
    }
  };

  return (
    <FormScreen
      title="New group"
      onBack={() => navigation.goBack()}
      action={{ label: 'Create group', onPress: createGroup }}
      scrollEnabled={!dialDragging}
    >
      <TextField label="Group name" placeholder="e.g. Saturday Crew" value={name} onChangeText={setName} />

      <CadenceFields
        cadence={cadence}
        onCadenceChange={setCadence}
        frequency={frequency}
        onFrequencyChange={setFrequency}
        duration={duration}
        onDurationChange={setDuration}
      />

      <CallWindowField
        start={windowStart}
        end={windowEnd}
        onChangeStart={setWindowStart}
        onChangeEnd={setWindowEnd}
        onDragChange={setDialDragging}
        groupTz={deviceTz ?? 'UTC'}
      />
    </FormScreen>
  );
}
