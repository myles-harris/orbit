import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { onPhoto } from '../theme';

// The design's Cinzel-drawn mark, translated for Cormorant. Constants below are
// measured at the sign-in scale (capHeight 161) — see 00-CONTEXT.md, Step 10.
//
// Font metrics are read from Cormorant_700Bold_Italic.ttf (unitsPerEm 1000):
// capHeight 625 and hhea ascender 924. The OS/2 typo ascender is the same 924
// and USE_TYPO_METRICS is set, so iOS and Android agree on where the baseline
// sits in the font's natural line box.
const CORMORANT_CAP_RATIO = 0.625;
const CORMORANT_ASCENT = 0.924;
// The box-to-cap ratio (180/161) comes from the original Cinzel construction
// (line-height .78 at fontSize 230).
const BOX_TO_CAP = 180 / 161;
const REFERENCE_CAP = 161;
const REFERENCE_WORD_FONT_SIZE = 40; // 36 × CAP_K
const REFERENCE_WORD_LETTER_SPACING = 3.2; // 0.08em at fontSize 40
const REFERENCE_WORD_PADDING_LEFT = 34;
const REFERENCE_WORD_TOP = 62.6; // 90 − 19.44 − 8

interface OrbitLogoProps {
  /** Cap height of the marigold "O", in points. Defaults to the sign-in scale. */
  capHeight?: number;
  style?: StyleProp<ViewStyle>;
}

// Three stacked layers: the full word in cream behind everything, the bare
// letter "O" in marigold above that, and the word again with a transparent
// first character in front — the marigold O reads as woven through the R.
export function OrbitLogo({ capHeight = REFERENCE_CAP, style }: OrbitLogoProps) {
  const scale = capHeight / REFERENCE_CAP;
  const boxHeight = Math.round(capHeight * BOX_TO_CAP);
  const letterFontSize = Math.round(capHeight / CORMORANT_CAP_RATIO);
  const wordFontSize = Math.round(REFERENCE_WORD_FONT_SIZE * scale);
  const wordTop = REFERENCE_WORD_TOP * scale;

  // The O's cap height is centred in the 180pt box the word layers are placed
  // against. `letterTop` is where the Text's natural line box has to start for
  // its baseline to land there: baseline − ascent.
  //
  // lineHeight is deliberately NOT pinned to the box height. With lineHeight
  // below the font's natural line height (180 vs ~312 here) RN places the glyph
  // differently per platform: Android's CustomLineHeightSpan splits the shortfall
  // evenly above and below, but iOS's RCTApplyBaselineOffsetForRange returns
  // early in that case and applies no offset at all. Placing from the font's own
  // baseline is the same on both, and still needs no line box taller than the
  // box — the Text is absolute inside a fixed-height, overflow-visible View with
  // includeFontPadding off, so nothing is clipped.
  const letterCap = letterFontSize * CORMORANT_CAP_RATIO;
  const letterTop = boxHeight / 2 + letterCap / 2 - CORMORANT_ASCENT * letterFontSize;

  const wordStyle = {
    fontFamily: 'Cormorant_700Bold_Italic',
    fontSize: wordFontSize,
    letterSpacing: REFERENCE_WORD_LETTER_SPACING * scale,
    paddingLeft: REFERENCE_WORD_PADDING_LEFT * scale,
    textAlign: 'center' as const,
    textTransform: 'uppercase' as const,
    includeFontPadding: false,
  };

  return (
    <View style={[styles.container, { height: boxHeight }, style]}>
      {/* z0 — full word, cream, behind */}
      <Text style={[wordStyle, onPhoto.textShadow, styles.absolute, { top: wordTop, color: onPhoto.title }]}>
        ORBIT
      </Text>

      {/* z1 — bare letter, marigold */}
      <Text
        style={[
          styles.absolute,
          {
            top: letterTop,
            fontFamily: 'Cormorant_700Bold_Italic',
            fontSize: letterFontSize,
            textAlign: 'center',
            includeFontPadding: false,
            color: onPhoto.accent,
          },
        ]}
      >
        O
      </Text>

      {/* z2 — word again, first character transparent, in front */}
      <Text style={[wordStyle, onPhoto.textShadow, styles.absolute, { top: wordTop }]}>
        <Text style={{ color: 'transparent' }}>O</Text>
        <Text style={{ color: onPhoto.title }}>RBIT</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    // The giant "O" extends past the box top; it must not be clipped.
    overflow: 'visible',
  },
  absolute: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
