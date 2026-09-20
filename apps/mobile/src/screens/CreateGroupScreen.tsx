import { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Localization from 'expo-localization';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { layout, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { BottomActionBar } from '../components/BottomActionBar';
import { CallWindowField } from '../components/CallWindowField';
import { Field, TextField } from '../components/Field';
import { FormHeader } from '../components/FormHeader';
import NumberPicker from '../components/NumberPicker';
import { SegmentedControl } from '../components/SegmentedControl';
import { SettingRow } from '../components/SettingRow';
import { CADENCE_OPTIONS, MAX_CALL_DURATION, MIN_CALL_DURATION } from '../utils/groupFormat';

type CreateGroupNavigationProp = StackNavigationProp<RootStackParamList, 'CreateGroup'>;

// Group Settings, derived: the same header, name field, segmented cadence control,
// steppers and call-window block, in the order name → cadence → frequency →
// duration → call window. Nothing here is drawn twice — each is one shared component.
export default function CreateGroupScreen() {
  const navigation = useNavigation<CreateGroupNavigationProp>();
  const { theme: { colors } } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [frequency, setFrequency] = useState(1);
  const [duration, setDuration] = useState(5);
  const [windowStart, setWindowStart] = useState(6);
  const [windowEnd, setWindowEnd] = useState(22);

  // The window is in the creator's own zone, which becomes the group's.
  const deviceTz = Localization.getCalendars()[0]?.timeZone;

  const handleCadenceChange = (value: 'daily' | 'weekly') => {
    setCadence(value);
    setFrequency(1);
  };

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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FormHeader title="New group" onBack={() => navigation.goBack()} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <TextField label="Group name" placeholder="e.g. Saturday Crew" value={name} onChangeText={setName} />

        <View style={styles.block}>
          <Field label="Call frequency" helper={cadence === 'daily' ? 'One call per day.' : undefined}>
            <SegmentedControl options={CADENCE_OPTIONS} value={cadence} onChange={handleCadenceChange} />
          </Field>
          <View>
            {cadence === 'weekly' && (
              <SettingRow
                label="Calls per week"
                variant={{
                  type: 'control',
                  control: <NumberPicker min={1} max={6} value={frequency} onChange={setFrequency} />,
                }}
              />
            )}
            <SettingRow
              label="Call duration"
              last
              variant={{
                type: 'control',
                control: (
                  <NumberPicker
                    min={MIN_CALL_DURATION}
                    max={MAX_CALL_DURATION}
                    value={duration}
                    onChange={setDuration}
                    suffix="min"
                    wide
                  />
                ),
              }}
            />
          </View>
        </View>

        <CallWindowField
          start={windowStart}
          end={windowEnd}
          onChangeStart={setWindowStart}
          onChangeEnd={setWindowEnd}
          groupTz={deviceTz ?? 'UTC'}
        />
      </ScrollView>

      <BottomActionBar label="Create group" onPress={createGroup} />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors']) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    content: {
      paddingHorizontal: layout.screenPad,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xl,
      gap: spacing.xl,
    },
    // The cadence control and the rows under it read as one group, tighter than
    // the blocks around them.
    block: { gap: spacing.sm },
  });
}
