import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatHour, MAX_WINDOW_HOUR, MIN_WINDOW_HOUR, windowEndMin, windowStartMax } from '../utils/groupFormat';
import { windowPreviewLines } from '../utils/windowPreview';
import { CallWindowDial } from './CallWindowDial';
import { Field } from './Field';
import NumberPicker from './NumberPicker';
import { SettingRow } from './SettingRow';

interface WindowInput {
  /** Whole hours, 0–23, in the group's own zone. */
  start: number;
  end: number;
  groupTz: string;
  /** One entry per member; duplicates collapse. Pass a stable array — it keys the memo. */
  memberTimeZones?: string[];
}

// The mono lines under the dial. Also drawn on their own for a member who can't
// edit the window but still wants to know what it is where they are.
export function WindowPreview({ start, end, groupTz, memberTimeZones }: WindowInput) {
  const { theme: { colors } } = useTheme();
  // Each zone line builds two Intl.DateTimeFormats, and a drag re-renders this once
  // per hour step. Nothing in it changes between steps but `start` and `end`.
  const lines = useMemo(
    () => windowPreviewLines({ start, end, groupTz, memberTimeZones }),
    [start, end, groupTz, memberTimeZones],
  );

  return (
    <View style={styles.preview}>
      {lines.map((line) => (
        <Text key={line} style={[styles.previewLine, { color: colors.textMeta }]}>{line}</Text>
      ))}
    </View>
  );
}

interface CallWindowFieldProps extends WindowInput {
  onChangeStart: (hour: number) => void;
  onChangeEnd: (hour: number) => void;
  /** Passed to the dial: true while a handle is held. See CallWindowDial. */
  onDragChange?: (dragging: boolean) => void;
}

// The whole call-window block — label, dial, From/Until steppers, and the zone
// preview — so Group Settings and Create Group can't drift apart. The dial and the
// steppers own the same two numbers; each is clamped by the other's hour.
export function CallWindowField({ onChangeStart, onChangeEnd, onDragChange, ...windowInput }: CallWindowFieldProps) {
  const { start, end } = windowInput;

  return (
    <Field label="Call window" helper="Calls are scheduled at a random time within this window, in the group's timezone.">
      <View style={styles.controls}>
        <CallWindowDial
          start={start}
          end={end}
          onChangeStart={onChangeStart}
          onChangeEnd={onChangeEnd}
          onDragChange={onDragChange}
        />
        <View style={styles.steppers}>
          <SettingRow
            label="From"
            variant={{
              type: 'control',
              control: (
                <NumberPicker
                  accessibilityLabel="From"
                  min={MIN_WINDOW_HOUR}
                  max={windowStartMax(end)}
                  value={start}
                  onChange={onChangeStart}
                  formatValue={formatHour}
                />
              ),
            }}
          />
          <SettingRow
            label="Until"
            variant={{
              type: 'control',
              control: (
                <NumberPicker
                  accessibilityLabel="Until"
                  min={windowEndMin(start)}
                  max={MAX_WINDOW_HOUR}
                  value={end}
                  onChange={onChangeEnd}
                  formatValue={formatHour}
                />
              ),
            }}
          />
        </View>
      </View>
      <WindowPreview {...windowInput} />
    </Field>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  steppers: {
    flex: 1,
  },
  preview: {
    marginTop: 12,
    gap: 1,
  },
  previewLine: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 11.5,
    lineHeight: 15,
  },
});
