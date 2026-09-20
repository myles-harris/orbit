import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import { CADENCE_OPTIONS, MAX_CALL_DURATION, MIN_CALL_DURATION } from '../utils/groupFormat';
import { Field } from './Field';
import NumberPicker from './NumberPicker';
import { SegmentedControl } from './SegmentedControl';
import { SettingRow } from './SettingRow';

interface CadenceFieldsProps {
  cadence: 'daily' | 'weekly';
  onCadenceChange: (cadence: 'daily' | 'weekly') => void;
  /** Calls per week. Only drawn for a weekly cadence; daily is always one a day. */
  frequency: number;
  onFrequencyChange: (frequency: number) => void;
  duration: number;
  onDurationChange: (minutes: number) => void;
  /**
   * The duration stepper's ceiling. A group already saved above the usual cap keeps
   * its true value until its owner steps down and saves (see `durationMax`).
   */
  durationCeiling?: number;
}

// How often a group calls, and for how long: the cadence control with the weekly
// count and the duration beneath it. Group Settings and Create Group both draw this,
// so the two forms cannot drift apart.
export function CadenceFields({
  cadence, onCadenceChange, frequency, onFrequencyChange, duration, onDurationChange,
  durationCeiling = MAX_CALL_DURATION,
}: CadenceFieldsProps) {
  return (
    // Tighter than the blocks around it: the control and the rows under it read as one group.
    <View style={styles.block}>
      <Field label="Call frequency" helper={cadence === 'daily' ? 'One call per day.' : undefined}>
        <SegmentedControl
          options={CADENCE_OPTIONS}
          value={cadence}
          onChange={(next) => {
            // Tapping the segment that is already selected changes nothing — in
            // particular it must not throw away the weekly count, or mark a form dirty.
            if (next === cadence) return;
            onCadenceChange(next);
            // A new cadence starts from one call, whatever the old one was set to.
            onFrequencyChange(1);
          }}
        />
      </Field>
      <View>
        {cadence === 'weekly' && (
          <SettingRow
            label="Calls per week"
            variant={{
              type: 'control',
              control: (
                <NumberPicker
                  accessibilityLabel="Calls per week"
                  min={1}
                  max={6}
                  value={frequency}
                  onChange={onFrequencyChange}
                />
              ),
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
                accessibilityLabel="Call duration"
                min={MIN_CALL_DURATION}
                max={durationCeiling}
                value={duration}
                onChange={onDurationChange}
                suffix="min"
                wide
              />
            ),
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
});
