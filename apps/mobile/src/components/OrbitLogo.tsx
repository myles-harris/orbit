import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { onPhoto } from '../theme';

// The Orbit mark: a big italic "O" with the word ORBIT set across its middle, drawn twice:
// once behind the O and once in front of it, so the O's stroke passes through the letters.
// Behind, the whole word, its own O included, half hidden by the stroke and half showing in
// the counter. In front, RBIT alone, read over the stroke where they cross it; the word's own
// O is masked there so it never paints over the big one.
//
// It is the design file (Orbit Logo.dc.html) as a browser draws it. The file asks for Cinzel
// italic 700, but Cinzel has no italic, so the Google Fonts link it carries is rejected and
// every browser without Cinzel installed falls through to the next family, Georgia. Georgia Bold
// Italic is what the design has always looked like, so it is what is drawn: that face's own
// outlines for O R B I T (y down, baseline at 0, in font units, 2048 to the em; Georgia is
// Microsoft's typeface, and only these five letters are used, as artwork). They are paths, not
// text, because iOS and Android do not both have Georgia and would each lay the type out their
// own way, and this is the one piece of artwork that has to match on both.
//
// The layout is the file's, in points: a 229 O at line-height .78, a 28 word tracked .26em with
// 36 of left padding, lifted 54% of its own height. It was checked against Chrome laying out the
// file itself: every letter lands within 0.02 of where the browser puts it.
//
// The word's shadow, 0 1px 3px rgba(58,44,26,.55), is two bitmaps, one under each copy of the
// word: Chrome's own rendering of that text-shadow from the file, at 3x. A blur cannot be drawn
// faithfully in react-native-svg on both platforms (Android's runs on RenderScript, deprecated
// since Android 12) and stacked strokes only approximate one, so it is the design's own pixels.
const GLYPHS: Record<string, { advance: number; d: string }> = {
  O: {
    advance: 1679,
    d: 'M1661-875Q1661-695 1593.5-527.5Q1526-360 1404-236Q1279-109 1110-35Q941 39 727 39Q447 39 267-122.5Q87-284 87-545Q87-735 160-902.5Q233-1070 362-1195Q488-1318 657.5-1388Q827-1458 1015-1458Q1297-1458 1479-1300Q1661-1142 1661-875M1138-351Q1206-489 1239-651.5Q1272-814 1272-972Q1272-1155 1202-1260Q1132-1365 993-1365Q871-1365 774.5-1283Q678-1201 612-1070Q546-939 511-774Q476-609 476-446Q476-269 546-161.5Q616-54 756-54Q877-54 975.5-138Q1074-222 1138-351',
  },
  R: {
    advance: 1633,
    d: 'M1147-1121Q1147-1228 1079.5-1280.5Q1012-1333 884-1333L816-1333L677-730L774-730Q937-730 1042-832.5Q1147-935 1147-1121M657-643L560-226Q556-209 553.5-194Q551-179 551-171Q551-126 588-105Q625-84 729-73L712 0L-55 0L-38-73Q-13-74 36.5-80.5Q86-87 110-95Q149-108 169.5-134Q190-160 198-195L427-1187Q432-1208 434-1222Q436-1236 436-1243Q436-1285 393.5-1308.5Q351-1332 255-1346L272-1419L1054-1419Q1298-1419 1420.5-1350Q1543-1281 1543-1141Q1543-976 1424-864.5Q1305-753 1088-701Q1129-626 1191.5-514.5Q1254-403 1337-258Q1361-215 1399.5-160.5Q1438-106 1481-91Q1502-84 1539-79Q1576-74 1592-73L1574 0L1056 0Q962-215 895.5-344.5Q829-474 729-643',
  },
  B: {
    advance: 1555,
    d: 'M1131-1142Q1131-1241 1068.5-1287Q1006-1333 904-1333Q884-1333 857-1331.5Q830-1330 815-1329L691-795L758-795Q930-795 1030.5-890.5Q1131-986 1131-1142M1053-469Q1053-584 979-645.5Q905-707 760-707Q740-707 710.5-705.5Q681-704 670-703L548-175Q549-138 603-112Q657-86 723-86Q856-86 954.5-193Q1053-300 1053-469M272-1419L1026-1419Q1283-1419 1403.5-1355.5Q1524-1292 1524-1161Q1524-1074 1485.5-1008Q1447-942 1384-897Q1321-851 1238.5-820Q1156-789 1068-771L1064-752Q1133-745 1204.5-722.5Q1276-700 1327-665Q1382-628 1414-575Q1446-522 1446-446Q1446-227 1262.5-113.5Q1079 0 721 0L-55 0L-38-73Q-13-74 36.5-80.5Q86-87 110-95Q149-108 169.5-134Q190-160 198-195L427-1187Q432-1208 434-1222Q436-1236 436-1243Q436-1285 393.5-1308.5Q351-1332 255-1346',
  },
  I: {
    advance: 923,
    d: 'M726 0L-61 0L-44-73Q-15-74 35-79.5Q85-85 112-94Q151-107 171.5-133.5Q192-160 200-195L429-1187Q434-1208 436-1222Q438-1236 438-1243Q438-1285 391.5-1308.5Q345-1332 249-1346L266-1419L1053-1419L1036-1346Q1004-1344 954-1336.5Q904-1329 879-1321Q838-1308 818.5-1280.5Q799-1253 791-1219L562-226Q558-209 555.5-194Q553-179 553-171Q553-121 599.5-101.5Q646-82 743-73',
  },
  T: {
    advance: 1401,
    d: 'M216-1419L1591-1419L1497-1013L1420-1013Q1416-1047 1404.5-1098Q1393-1149 1373-1199Q1352-1251 1327.5-1285Q1303-1319 1269-1325Q1239-1329 1192.5-1332Q1146-1335 1112-1335L1062-1335L807-232Q803-215 800.5-199.5Q798-184 798-177Q798-153 807.5-134.5Q817-116 843-105Q867-95 913-85.5Q959-76 989-73L972 0L181 0L198-73Q226-75 280-81Q334-87 357-95Q397-111 417-138Q437-165 445-202L707-1335L668-1335Q630-1335 591.5-1332.5Q553-1330 504-1325Q468-1320 423.5-1282Q379-1244 337-1199Q287-1143 254.5-1097.5Q222-1052 199-1013L122-1013',
  },
};


const UPEM = 2048;

// ── The design's "current defaults", in points ──
const BIG_SIZE = 229;
const BIG_LINE_HEIGHT = 0.78;
const WORD_SIZE = 28;
const WORD_TRACKING = 0.26 * WORD_SIZE; // letter-spacing .26em
// nudgeX 18, doubled: the word is centred in what the padding leaves, which moves it 18 right.
const WORD_PAD_LEFT = 36;
const WORD_LIFT = 0.54; // translateY(-54%): 4% above true centre, nudgeY 0

// Where a browser sets each baseline. Georgia's ascent (.917) and descent (.219) are each
// rounded to a whole pixel at the size and the half-leading is floored: the O's 178.6 line box
// holds 210 + 50, so floor((178.6 − 260) / 2) + 210 = 169; the word's 28 box holds 26 + 6, so
// (28 − 32) / 2 + 26 = 24.
const BIG_BASELINE = 169;
const WORD_BASELINE_IN_BOX = 24;

// The design's wordShadow, on by default. Both bitmaps cover the same frame, in the box's points;
// each is 3x that, and holds the shadow alone in the design's brown at its alpha.
const WORD_SHADOW = true;
const SHADOW_FRAME = { x: 40, y: 72, width: 140, height: 34 };
const shadowBehind = require('../../assets/orbit-logo-shadow-behind.png');
const shadowFront = require('../../assets/orbit-logo-shadow-front.png');

// The lockup is as wide as the O is advanced, and as tall as its line box.
const WIDTH = (GLYPHS.O.advance * BIG_SIZE) / UPEM;
const HEIGHT = BIG_SIZE * BIG_LINE_HEIGHT;

type Matrix = [number, number, number, number, number, number];

// Scales an outline to `size` and sets it at (x, baseline). The face is a true italic, so
// nothing is sheared.
const place = (size: number, x: number, baseline: number): Matrix => {
  const s = size / UPEM;
  return [s, 0, 0, s, x, baseline];
};

const LETTERS = ['O', 'R', 'B', 'I', 'T'];
// Each letter's step is its advance plus the tracking; the face has no kerning. CSS puts the
// tracking after the last letter too, so it counts toward the width the word is centred by.
const steps = LETTERS.map((ch) => (GLYPHS[ch].advance * WORD_SIZE) / UPEM + WORD_TRACKING);
const wordWidth = steps.reduce((sum, step) => sum + step, 0);
const wordBaseline = HEIGHT / 2 - WORD_LIFT * WORD_SIZE + WORD_BASELINE_IN_BOX;

let pen = WORD_PAD_LEFT + (WIDTH - WORD_PAD_LEFT - wordWidth) / 2;
const WORD = LETTERS.map((ch, i) => {
  const x = pen;
  pen += steps[i];
  return { ch, d: GLYPHS[ch].d, matrix: place(WORD_SIZE, x, wordBaseline) };
});
// RBIT: in front, the word's own O is masked. It keeps its advance above, so RBIT is tracked
// where it should be, and paints nothing.
const TAIL = WORD.slice(1);

interface OrbitLogoProps {
  style?: StyleProp<ViewStyle>;
}

export function OrbitLogo({ style }: OrbitLogoProps) {
  const word = (layer: 'behind' | 'front', letters: typeof WORD) =>
    letters.map(({ ch, d, matrix }) => (
      <Path key={layer + ch} d={d} fill={onPhoto.title} transform={matrix} />
    ));
  // Beneath a word's letters, as CSS paints a text-shadow. No fade-in on Android, or the shadow
  // would arrive after the letters.
  const shadow = (source: number) =>
    WORD_SHADOW ? <Image source={source} style={styles.shadow} fadeDuration={0} /> : null;
  const canvas = { width: WIDTH, height: HEIGHT, viewBox: `0 0 ${WIDTH} ${HEIGHT}`, style: styles.layer };

  return (
    <View
      style={[styles.box, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Orbit"
      pointerEvents="none"
    >
      {shadow(shadowBehind)}
      <Svg {...canvas}>
        {word('behind', WORD)}
        <Path d={GLYPHS.O.d} fill={onPhoto.accent} transform={place(BIG_SIZE, 0, BIG_BASELINE)} />
      </Svg>
      {shadow(shadowFront)}
      <Svg {...canvas}>{word('front', TAIL)}</Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: WIDTH, height: HEIGHT },
  layer: { position: 'absolute', left: 0, top: 0 },
  shadow: {
    position: 'absolute',
    left: SHADOW_FRAME.x,
    top: SHADOW_FRAME.y,
    width: SHADOW_FRAME.width,
    height: SHADOW_FRAME.height,
  },
});
