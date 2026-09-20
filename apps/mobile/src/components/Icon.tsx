import Svg, { Path, Circle } from 'react-native-svg';

// The thirteen Feather-style paths extracted from the design file (00-CONTEXT.md,
// Appendix D). Ionicons is a different set at a different optical weight — mixing
// it with these reads as unfinished, so every Marigold screen draws from here
// instead. CallScreen is the one screen exempt (00-CONTEXT.md non-goals).
export type IconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'check'
  | 'minus'
  | 'plus'
  | 'settings'
  | 'camera'
  | 'share'
  | 'trash'
  | 'sun'
  | 'moon'
  | 'wifi-off';

const PATHS: Record<IconName, string> = {
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-up': 'M18 15l-6-6-6 6',
  check: 'M20 6L9 17l-5-5',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  settings:
    'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  camera: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z',
  share: 'M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M12 3v13M8 7l4-4 4 4',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  sun: 'M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  'wifi-off':
    'M1 1l22 22M16.7 16.7A10.9 10.9 0 0012 15c-1.7 0-3.3.4-4.7 1.2M5 12.5a15.9 15.9 0 013.6-2M2 8.8A20.9 20.9 0 0112 5c3.6 0 7 1 9.9 2.9M12 20h.01',
};

// Names whose glyph needs a circle alongside the path.
const CIRCLES: Partial<Record<IconName, { cx: number; cy: number; r: number }>> = {
  settings: { cx: 12, cy: 12, r: 3 },
  camera: { cx: 12, cy: 13, r: 4 },
  sun: { cx: 12, cy: 12, r: 4 },
};

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
}

export function Icon({ name, size = 22, color }: IconProps) {
  const circle = CIRCLES[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {circle && (
        <Circle
          cx={circle.cx}
          cy={circle.cy}
          r={circle.r}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
