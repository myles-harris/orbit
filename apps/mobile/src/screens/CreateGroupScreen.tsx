import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import NumberPicker from '../components/NumberPicker';
import { formatHour, windowStartMax, windowEndMin } from '../utils/groupFormat';

type CreateGroupNavigationProp = StackNavigationProp<RootStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen() {
  const navigation = useNavigation<CreateGroupNavigationProp>();
  const { theme: { colors, typography, shadow } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, typography, shadow), [colors]);

  const [name, setName] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [frequency, setFrequency] = useState(1);
  const [duration, setDuration] = useState(5);
  const [windowStart, setWindowStart] = useState(6);
  const [windowEnd, setWindowEnd] = useState(22);

  const handleCadenceChange = (value: 'daily' | 'weekly') => {
    setCadence(value);
    setFrequency(1);
  };

  const createGroup = async () => {
    if (!name.trim()) { Alert.alert('Missing Name', 'Please enter a group name'); return; }
    try {
      const client = await createAuthenticatedApiClient();
      const deviceTz = Localization.getCalendars()[0]?.timeZone;
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Group Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Saturday Crew"
            placeholderTextColor={colors.textTertiary}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Call Frequency</Text>
          <View style={styles.segmentRow}>
            <TouchableOpacity
              style={[styles.segment, cadence === 'daily' && styles.segmentActive]}
              onPress={() => handleCadenceChange('daily')}
            >
              <Text style={[styles.segmentText, cadence === 'daily' && styles.segmentTextActive]}>Daily</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, cadence === 'weekly' && styles.segmentActive]}
              onPress={() => handleCadenceChange('weekly')}
            >
              <Text style={[styles.segmentText, cadence === 'weekly' && styles.segmentTextActive]}>Weekly</Text>
            </TouchableOpacity>
          </View>
          {cadence === 'daily' ? (
            <Text style={styles.helperText}>One call per day.</Text>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Calls per Week</Text>
              <NumberPicker min={1} max={6} value={frequency} onChange={setFrequency} />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Call Window</Text>
          <Text style={styles.helperText}>Calls are scheduled at a random time within this window (your local time).</Text>
          <View style={styles.windowStack}>
            <Text style={styles.fieldLabel}>Earliest</Text>
            <NumberPicker
              min={0}
              max={windowStartMax(windowEnd)}
              value={windowStart}
              onChange={setWindowStart}
              formatValue={formatHour}
            />
            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Latest</Text>
            <NumberPicker
              min={windowEndMin(windowStart)}
              max={23}
              value={windowEnd}
              onChange={setWindowEnd}
              formatValue={formatHour}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Call Duration</Text>
          <NumberPicker min={2} max={30} value={duration} onChange={setDuration} suffix="min" />
        </View>

        <TouchableOpacity style={styles.createButton} onPress={createGroup} activeOpacity={0.85}>
          <Text style={styles.createButtonText}>Create Group</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: any, typography: any, shadow: any) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    content: { padding: spacing.xl, paddingBottom: 60 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.md, ...shadow.sm },
    fieldLabel: { ...typography.captionMedium, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600', marginBottom: spacing.sm },
    input: { backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 16, color: colors.text },
    segmentRow: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: radius.md, padding: 3 },
    segment: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.sm, alignItems: 'center' },
    segmentActive: { backgroundColor: colors.surface, ...shadow.sm },
    segmentText: { ...typography.captionMedium, color: colors.textSecondary, fontWeight: '600' },
    segmentTextActive: { color: colors.primary },
    helperText: { ...typography.small, color: colors.textTertiary, marginTop: spacing.sm, marginBottom: spacing.sm },
    windowStack: { marginTop: spacing.sm },
    createButton: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg, ...shadow.lg },
    createButtonText: { ...typography.bodySemibold, color: '#fff' },
  });
}
