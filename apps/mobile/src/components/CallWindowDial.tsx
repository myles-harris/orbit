import { useMemo, useRef } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { arcLength, arcRotation, dragHour, hourPoint, nearestHandle, touchHour, windowSpan } from '../utils/dialMath';
import { MAX_WINDOW_HOUR, MIN_WINDOW_HOUR, windowEndMin, windowStartMax } from '../utils/groupFormat';

interface CallWindowDialProps {
  /** Whole hours, 0–23, in the group's zone. */
  start: number;
  end: number;
  onChangeStart: (hour: number) => void;
  onChangeEnd: (hour: number) => void;
}

// Appendix B: a 60pt ring with an 8pt band, 12pt handles.
const SIZE = 60;
const BAND = 8;
const RADIUS = (SIZE - BAND) / 2; // the band's centre line
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const HANDLE = 12;
const HANDLE_RING = 2;
// 60pt is a small target for a fingertip, so the touch area reaches past the ring.
const HIT_PAD = 8;
const HIT_SIZE = SIZE + HIT_PAD * 2;
const HIT_CENTER = HIT_SIZE / 2;
// Inside the label there is no meaningful angle, and a tap on the number should
// not fling a handle across the ring.
const DEAD_ZONE = 6;

// A 24-hour clock face: midnight at 12 o'clock, hours clockwise. It is the same
// state the From/Until steppers beside it own — dragging just sets it faster — so
// the steppers stay as the accessible path and this is hidden from screen readers.
//
// The marigold arc is a stroked circle with a dash, not a conic gradient (React
// Native has none). SVG strokes begin at 3 o'clock, hence the rotation.
export function CallWindowDial({ start, end, onChangeStart, onChangeEnd }: CallWindowDialProps) {
  const { theme: { colors } } = useTheme();

  // The responder callbacks live as long as the view does, so they read the latest
  // props through a ref rather than closing over a render's worth of them.
  const latest = useRef({ start, end, onChangeStart, onChangeEnd });
  latest.current = { start, end, onChangeStart, onChangeEnd };
  const picked = useRef<'start' | 'end' | null>(null);

  const touch = (event: GestureResponderEvent, pickHandle: boolean) => {
    // locationX/Y are relative to the touched view. Everything inside is
    // pointerEvents="none", so that is always the hit area itself.
    const dx = event.nativeEvent.locationX - HIT_CENTER;
    const dy = event.nativeEvent.locationY - HIT_CENTER;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return;

    const touched = touchHour(dx, dy);
    const now = latest.current;
    if (pickHandle) picked.current = nearestHandle(now.start, now.end, touched);

    if (picked.current === 'start') {
      // The steppers' guards, so a handle dragged past its partner stops beside it.
      const next = dragHour(now.start, touched, MIN_WINDOW_HOUR, windowStartMax(now.end));
      if (next !== now.start) now.onChangeStart(next);
    } else if (picked.current === 'end') {
      const next = dragHour(now.end, touched, windowEndMin(now.start), MAX_WINDOW_HOUR);
      if (next !== now.end) now.onChangeEnd(next);
    }
  };

  const release = () => { picked.current = null; };

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const startPoint = hourPoint(start, SIZE / 2, SIZE / 2, RADIUS);
  const endPoint = hourPoint(end, SIZE / 2, SIZE / 2, RADIUS);

  return (
    <View
      style={styles.hitArea}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // Inside a ScrollView: once the dial has the touch, the page must not take it back.
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => touch(e, true)}
      onResponderMove={(e) => touch(e, false)}
      onResponderRelease={release}
      onResponderTerminate={release}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View pointerEvents="none" style={styles.dial}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={colors.controlTrack} strokeWidth={BAND} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.accent}
            strokeWidth={BAND}
            fill="none"
            strokeDasharray={[arcLength(start, end, CIRCUMFERENCE), CIRCUMFERENCE]}
            rotation={arcRotation(start)}
            originX={SIZE / 2}
            originY={SIZE / 2}
          />
          {/* Espresso disc, ringed in the page colour so it reads as sitting on the band.
              Drawn at HANDLE/2 + HANDLE_RING/2: the stroke is centred on that radius, so it
              paints over the outer 1pt of the fill, leaving a visible disc of exactly
              HANDLE with the ring outside it. */}
          {[startPoint, endPoint].map((p, i) => (
            <Circle
              key={i === 0 ? 'start' : 'end'}
              cx={p.x}
              cy={p.y}
              r={HANDLE / 2 + HANDLE_RING / 2}
              fill={colors.onAccent}
              stroke={colors.background}
              strokeWidth={HANDLE_RING}
            />
          ))}
        </Svg>
        <View style={styles.label}>
          <Text style={styles.labelText}>{windowSpan(start, end)}h</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors']) {
  return StyleSheet.create({
    // Negative margin: the layout still takes 60pt, the touch area 76.
    hitArea: {
      width: HIT_SIZE,
      height: HIT_SIZE,
      margin: -HIT_PAD,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dial: { width: SIZE, height: SIZE },
    label: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    labelText: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 13,
      color: colors.text,
    },
  });
}
