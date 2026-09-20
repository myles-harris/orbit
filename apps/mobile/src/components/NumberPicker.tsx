import { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { layout } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { Icon } from './Icon';

const INITIAL_DELAY = 400;
const MIN_DELAY = 60;
const DECAY = 0.65;

type Direction = 1 | -1;

interface NumberPickerProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  formatValue?: (v: number) => string;
  /** The duration's "10 min" needs a wider readout than an hour or a count does. */
  wide?: boolean;
  /** What this stepper sets — the visible label sits in a sibling Text, so a screen reader would otherwise hear only "6 AM, adjustable". */
  accessibilityLabel?: string;
}

export default function NumberPicker({
  min, max, value, onChange, suffix, formatValue, wide, accessibilityLabel,
}: NumberPickerProps) {
  const { theme: { colors } } = useTheme();
  const styles = useMemo(() => makeStyles(colors, !!wide), [colors, wide]);

  // Live prop mirrors — let every callback keep empty dep arrays, so the repeat
  // loop can never capture a stale bound or onChange. Callers can pass inline
  // arrow functions safely.
  const valueRef = useRef(value);
  const boundsRef = useRef({ min, max });
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  boundsRef.current = { min, max };
  onChangeRef.current = onChange;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(INITIAL_DELAY);
  // Owned by the gesture: seeded from the live value at press-in, authoritative
  // until release. Do NOT replace currentRef.current with `value` inside step —
  // reading from React on every tick at 60 ms is not reliably current and causes
  // the picker to advance one step and stall on hold.
  const currentRef = useRef(value);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    delayRef.current = INITIAL_DELAY;
  }, []);

  useEffect(() => stop, [stop]);

  const step = useCallback((direction: Direction) => {
    const { min: lo, max: hi } = boundsRef.current;
    const candidate = Math.max(lo, Math.min(hi, currentRef.current + direction));
    if (candidate === currentRef.current) { stop(); return false; }
    currentRef.current = candidate;
    onChangeRef.current(candidate);
    Haptics.selectionAsync().catch(() => {});
    return true;
  }, [stop]);

  const start = useCallback((direction: Direction) => {
    stop();
    currentRef.current = valueRef.current;
    if (!step(direction)) return;
    const tick = () => {
      if (!step(direction)) return;
      delayRef.current = Math.max(MIN_DELAY, delayRef.current * DECAY);
      timerRef.current = setTimeout(tick, delayRef.current);
    };
    timerRef.current = setTimeout(tick, delayRef.current);
  }, [step, stop]);

  const nudge = useCallback((direction: Direction) => {
    stop();
    currentRef.current = valueRef.current;
    step(direction);
  }, [step, stop]);

  const atMin = value <= min;
  const atMax = value >= max;
  const label = formatValue ? formatValue(value) : suffix ? `${value} ${suffix}` : String(value);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: label }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') nudge(1);
        if (e.nativeEvent.actionName === 'decrement') nudge(-1);
      }}
    >
      <Pressable
        onPressIn={() => start(-1)}
        onPressOut={stop}
        disabled={atMin}
        style={[styles.button, atMin && styles.buttonDisabled]}
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name="minus" size={18} color={colors.text} />
      </Pressable>

      <View style={styles.readout}>
        <Text style={styles.value}>{label}</Text>
      </View>

      <Pressable
        onPressIn={() => start(1)}
        onPressOut={stop}
        disabled={atMax}
        style={[styles.button, atMax && styles.buttonDisabled]}
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name="plus" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

// The design's stepper: a 44pt − and + around a readout that carries a hairline
// above and below it. The readout is a minWidth, so "10 PM" grows it rather than clipping.
const READOUT_WIDTH = 46;
const READOUT_WIDTH_WIDE = 72;

function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], wide: boolean) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    button: { width: layout.touchMin, height: layout.touchMin, justifyContent: 'center', alignItems: 'center' },
    buttonDisabled: { opacity: 0.3 },
    readout: {
      minWidth: wide ? READOUT_WIDTH_WIDE : READOUT_WIDTH,
      height: layout.touchMin,
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    value: {
      textAlign: 'center',
      fontFamily: 'GeistMono_500Medium',
      fontSize: 16,
      color: colors.text,
    },
  });
}
