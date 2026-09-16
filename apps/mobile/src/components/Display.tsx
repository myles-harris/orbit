import { Text, TextProps } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type Props = TextProps & {
  size: number;
  /** Line-height multiple. The design assigns this by role — see the ramp in
   *  Appendix A. 1.15 is the common case (tile names); the countdowns are 1,
   *  and a flat default would silently inflate their line box. */
  leading?: number;
  tabular?: boolean;
  color?: string;
};

// Cormorant's cap height is 0.625em against Cinzel's 0.700, so the mockup's sizes
// render 12% small. CAP_K restores the optical size, so call sites use the number
// from the design file. The italic is a drawn face (italicAngle -10deg) — never
// set fontStyle or a skew transform here.
const CAP_K = 1.12;

export function Display({
  size, leading = 1.15, tabular, color, style, ...rest
}: Props) {
  const { theme } = useTheme();
  const fontSize = Math.round(size * CAP_K);
  return (
    <Text
      {...rest}
      // The design boxes display text tightly (square tiles, a 46pt filter row,
      // a 122pt member viewport). Uncapped scaling breaks those; disabling
      // scaling outright is an accessibility regression. Cap it.
      maxFontSizeMultiplier={1.3}
      style={[
        {
          fontFamily: 'Cormorant_700Bold_Italic',
          fontSize,
          lineHeight: Math.round(fontSize * leading),
          letterSpacing: 0,
          textTransform: 'uppercase', // Cinzel is caps-only; this matches the mockup
          color: color ?? theme.colors.text,
          // Android pads above the ascender and below the descender by default,
          // so every vertical offset taken from a CSS mockup lands a few points
          // off on Android only. Turn it off here, once. (A TextStyle property,
          // not a Text prop, in this RN version.)
          includeFontPadding: false,
          ...(tabular ? { fontVariant: ['tabular-nums' as const] } : null),
        },
        style,
      ]}
    />
  );
}
