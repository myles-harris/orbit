import { useEffect, useMemo, useRef } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import {
  arcLength,
  arcRotation,
  hourPoint,
  nearestHandle,
  shortestDelta,
  sweptHour,
  touchHour,
  windowSpan,
} from '../utils/dialMath';
import { MAX_WINDOW_HOUR, MIN_WINDOW_HOUR, windowEndMin, windowStartMax } from '../utils/groupFormat';

interface CallWindowDialProps {
  /** Whole hours, 0–23, in the group's zone. */
  start: number;
  end: number;
  onChangeStart: (hour: number) => void;
  onChangeEnd: (hour: number) => void;
  /**
   * True from the moment a handle is picked up until the finger lets go. A screen
   * holding this in a ScrollView should stop that ScrollView scrolling meanwhile:
   * React Native only stops a parent taking over a touch on Android, and a ring
   * always drags with a vertical component.
   */
  onDragChange?: (dragging: boolean) => void;
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
// Inside the label there is no meaningful angle.
const DEAD_ZONE = 6;
// One touch event moving a quarter of the clock or more is the finger passing
// through the centre, where the angle flips, not a drag.
const MAX_STEP_HOURS = 6;

interface Grab {
  handle: 'start' | 'end';
  /** The handle's hour when it was picked up. */
  origin: number;
  /** The touch's hour at the previous event. */
  last: number;
  /** Hours swept round the clock since pick-up, unwrapped. */
  swept: number;
}

// A 24-hour clock face: midnight at 12 o'clock, hours clockwise. It is the same
// state the From/Until steppers beside it own — dragging just sets it faster — so
// the steppers stay as the accessible path and this is hidden from screen readers.
//
// Touching the ring picks up the nearer handle without moving it; the handle then
// moves by the angle the finger sweeps. So a brush or a tap changes nothing, and
// grabbing the ring far from a handle does not make the handle jump to the finger.
//
// The marigold arc is a stroked circle with a dash, not a conic gradient (React
// Native has none). SVG strokes begin at 3 o'clock, hence the rotation.
export function CallWindowDial({ start, end, onChangeStart, onChangeEnd, onDragChange }: CallWindowDialProps) {
  const { theme: { colors } } = useTheme();

  // The responder callbacks live as long as the view does, so they read the latest
  // props through a ref rather than closing over a render's worth of them.
  const latest = useRef({ start, end, onChangeStart, onChangeEnd, onDragChange });
  latest.current = { start, end, onChangeStart, onChangeEnd, onDragChange };
  const grab = useRef<Grab | null>(null);

  // The fractional hour under a touch, or null in the centre. locationX/Y are
  // relative to the touched view; everything inside is pointerEvents="none", so that
  // is always the hit area itself.
  const hourAt = (event: GestureResponderEvent): number | null => {
    const dx = event.nativeEvent.locationX - HIT_CENTER;
    const dy = event.nativeEvent.locationY - HIT_CENTER;
    return Math.hypot(dx, dy) < DEAD_ZONE ? null : touchHour(dx, dy);
  };

  // Returns whether the touch was taken. React Native blocks a parent ScrollView from
  // stealing the touch only when the grant handler returns exactly `true`.
  const pickUp = (event: GestureResponderEvent): boolean => {
    const touched = hourAt(event);
    if (touched === null) return false;
    const now = latest.current;
    const handle = nearestHandle(now.start, now.end, touched);
    grab.current = { handle, origin: handle === 'start' ? now.start : now.end, last: touched, swept: 0 };
    now.onDragChange?.(true);
    return true;
  };

  const follow = (event: GestureResponderEvent) => {
    const g = grab.current;
    const touched = hourAt(event);
    if (!g || touched === null) return;

    const step = shortestDelta(touched - g.last);
    g.last = touched;
    if (Math.abs(step) >= MAX_STEP_HOURS) return;
    g.swept += step;

    const now = latest.current;
    if (g.handle === 'start') {
      // The steppers' guards, so a handle swept past its partner stops beside it.
      const next = sweptHour(g.origin, g.swept, MIN_WINDOW_HOUR, windowStartMax(now.end));
      if (next !== now.start) now.onChangeStart(next);
    } else {
      const next = sweptHour(g.origin, g.swept, windowEndMin(now.start), MAX_WINDOW_HOUR);
      if (next !== now.end) now.onChangeEnd(next);
    }
  };

  const letGo = () => {
    if (!grab.current) return;
    grab.current = null;
    latest.current.onDragChange?.(false);
  };

  // A dial unmounted mid-drag must not leave its screen locked.
  useEffect(() => letGo, []);

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
      onResponderGrant={pickUp}
      onResponderMove={follow}
      onResponderRelease={letGo}
      onResponderTerminate={letGo}
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
    // The layout still takes 60pt; the touch area is 76. The negative margin puts up to
    // 8pt of that outside the parents' bounds, which is safe: React Native only refuses
    // a touch outside a parent's bounds when that parent clips (overflow hidden/scroll,
    // or clipChildren — see TouchTargetHelper.findTouchTargetView), and nothing above
    // the dial does.
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
