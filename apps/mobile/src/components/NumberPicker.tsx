import { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

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
}

export default function NumberPicker({
  min, max, value, onChange, suffix, formatValue,
}: NumberPickerProps) {
  const { theme: { colors } } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        style={styles.button}
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[styles.symbol, atMin && styles.symbolDisabled]}>−</Text>
      </Pressable>

      <Text style={styles.value}>{label}</Text>

      <Pressable
        onPressIn={() => start(1)}
        onPressOut={stop}
        disabled={atMax}
        style={styles.button}
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[styles.symbolAdd, atMax && styles.symbolDisabled]}>+</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: radius.md,
      paddingHorizontal: spacing.xs,
      height: 48,
    },
    button: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
    symbol: { fontSize: 22, lineHeight: 26, color: colors.textSecondary },
    symbolAdd: { fontSize: 22, lineHeight: 26, color: colors.primary },
    symbolDisabled: { opacity: 0.3 },
    value: {
      flex: 1,
      textAlign: 'center',
      fontFamily: 'RobotoMono_500Medium',
      fontSize: 16,
      color: colors.text,
    },
  });
}
