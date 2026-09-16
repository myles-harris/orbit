// ─── Static (no theme dependency) ────────────────────────────────────────────
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const radius = {
  xs: 3,    // Invited count chip
  sm: 6,    // segmented control inner pill
  md: 8,    // buttons, inputs, share row
  lg: 9,    // segmented control outer track
  xl: 10,   // tiles, menu, banner, danger box, invite row
  xxl: 12,  // live card, photo thumb
  huge: 14, // spotlight card
  full: 999,
};

// Design geometry that isn't on the 8pt `spacing` grid (10, 14, 22, 26, 34).
// Kept as literals here rather than in `spacing` so screens never reach for a
// nearby-but-wrong spacing value.
export const layout = {
  screenPad: 20, gridPad: 16, gridGap: 10,
  headerHeight: 56, filterHeight: 46,
  rowHeight: 56,        // 60 where the design draws a toggle. Apply as minHeight.
  tilePad: 14, barTopPad: 12,
  primaryBtn: 52, secondaryBtn: 50, touchMin: 44,
};

// ─── Palettes ─────────────────────────────────────────────────────────────────
// Marigold v10. Light and dark are independent palettes, not inversions:
// light carries structure with hairline rules and a 1px cast shadow,
// dark carries it with surface steps.
//
// MARIGOLD IS RESERVED. See AC-3 for the exhaustive role list. Marigold on cream
// is 1.60:1 — on light backgrounds it is decoration (underlines, borders, the
// active-tab rule) and never carries text meaning.

const marigold = '#F6BF10';
const espresso = '#3A2C1A';
const cream    = '#FFF8E7';
const wheat    = '#E2C48D';

const darkPalette = {
  background:   '#211A12',
  surface:      '#2E241A',
  text:         cream,
  textSecondary:'#B08A5E',   // AA correction: the design's #A67C52 is 4.07:1 on surface
  textMeta:     wheat,       // mono values, avatar initials, metadata
  hairline:     'rgba(226,196,141,.16)',
  borderStrong: 'rgba(226,196,141,.40)',
  controlTrack: 'rgba(226,196,141,.16)',
  toggleTrack:  'rgba(226,196,141,.22)',
  danger:       '#D98A72',
  homeIndicator:'rgba(255,248,231,.50)',
};

const lightPalette = {
  background:   cream,
  surface:      '#FFFFFF',
  text:         espresso,
  textSecondary:'#7A5F43',
  textMeta:     '#7A5F43',
  hairline:     'rgba(58,44,26,.12)',
  borderStrong: 'rgba(58,44,26,.28)',
  controlTrack: 'rgba(58,44,26,.12)',
  toggleTrack:  'rgba(58,44,26,.18)',
  danger:       '#8C3A2A',
  homeIndicator:'rgba(58,44,26,.45)',
};

type Palette = typeof darkPalette;

// Fixed in both modes — these sit over a dark photo scrim, never over a surface.
export const onPhoto = {
  title: cream, meta: cream, sub: wheat, accent: marigold,
  textShadow:      { textShadowColor: 'rgba(0,0,0,.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  textShadowLarge: { textShadowColor: 'rgba(0,0,0,.50)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
};

// Gradient stops for expo-linear-gradient. `locations` are 0–1, not CSS percentages.
export const scrim = {
  tileTop:      ['rgba(26,20,14,.86)', 'rgba(26,20,14,.34)', 'rgba(26,20,14,.10)'], // 0 / .52 / 1
  tileBottom:   ['rgba(26,20,14,.66)', 'rgba(26,20,14,.40)', 'rgba(26,20,14,0)'],   // 0 / .30 / .55
  liveCard:     ['rgba(26,20,14,.88)', 'rgba(26,20,14,.70)', 'rgba(26,20,14,.48)'], // →right, 0 / .58 / 1
  spotlight:    ['rgba(26,20,14,.60)', 'rgba(26,20,14,.78)', 'rgba(26,20,14,.92)'], // ↓down, 0 / .46 / 1
  detailHeader: ['rgba(26,20,14,.55)', 'rgba(26,20,14,0)'],                          // ↓down over 112pt
};

// ─── Derived tokens ───────────────────────────────────────────────────────────

function makeColors(p: Palette, isDark: boolean) {
  return {
    // Marigold — reserved. See AC-3 for the exhaustive list of roles.
    accent:     marigold,
    onAccent:   espresso,
    accentSoft: isDark ? 'rgba(246,191,16,.10)' : 'rgba(246,191,16,.16)',

    // Legacy alias — `primary` is `accent` under a name every existing screen
    // already reads. Screens not yet redesigned will re-skin in marigold as a
    // result, which is expected until their own PR restructures them.
    primary:        marigold,
    primaryDark:    '#D9A50E',
    primaryLight:   isDark ? 'rgba(246,191,16,.10)' : 'rgba(246,191,16,.16)',
    primaryLighter: isDark ? 'rgba(246,191,16,.06)' : 'rgba(246,191,16,.08)',

    success:      isDark ? '#4e9e7e' : '#3d8a6a',
    successLight: isDark ? '#162e24' : '#d8f0e8',
    successDark:  isDark ? '#3a7a62' : '#2a6e52',

    danger:      p.danger,
    dangerLight: isDark ? 'rgba(217,138,114,.14)' : 'rgba(140,58,42,.10)',
    dangerDark:  isDark ? '#F0B39E' : '#6B2A1E',

    warning:      isDark ? '#c99460' : '#a06c30',
    warningLight: isDark ? '#2a2016' : '#fdf0e0',

    background:       p.background,
    surface:          p.surface,
    surfaceSecondary: isDark ? '#3A2F20' : '#F3E9D3',

    text:          p.text,
    textSecondary: p.textSecondary,
    textTertiary:  p.textMeta,
    textMeta:      p.textMeta,
    textOnPrimary: espresso,   // white on marigold is 1.70:1 — espresso is 7.96:1

    border:      p.hairline,
    borderLight: isDark ? 'rgba(226,196,141,.10)' : 'rgba(58,44,26,.08)',
    hairline:      p.hairline,
    borderStrong:  p.borderStrong,
    controlTrack:  p.controlTrack,
    toggleTrack:   p.toggleTrack,
    homeIndicator: p.homeIndicator,

    tabActive:   marigold,
    tabInactive: isDark ? '#8A7358' : '#A89478',
  };
}

function makeTypography(textColor: string, mutedColor: string) {
  return {
    h1: { fontSize: 34, fontFamily: 'Geist_600SemiBold', letterSpacing: -0.5, color: textColor },
    h2: { fontSize: 28, fontFamily: 'Geist_600SemiBold', letterSpacing: -0.3, color: textColor },
    h3: { fontSize: 22, fontFamily: 'Geist_600SemiBold', letterSpacing: -0.2, color: textColor },
    h4: { fontSize: 18, fontFamily: 'Geist_600SemiBold', color: textColor },
    body: { fontSize: 16, fontFamily: 'Geist_400Regular', color: textColor },
    bodyMedium: { fontSize: 16, fontFamily: 'Geist_500Medium', color: textColor },
    bodySemibold: { fontSize: 16, fontFamily: 'Geist_600SemiBold', color: textColor },
    caption: { fontSize: 14, fontFamily: 'Geist_400Regular', color: mutedColor },
    captionMedium: { fontSize: 14, fontFamily: 'Geist_500Medium', color: mutedColor },
    small: { fontSize: 12, fontFamily: 'Geist_400Regular', color: mutedColor },
    smallMedium: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: mutedColor },
  };
}

// `card` and `menu` replace the old `sm`/`md`/`lg` — two weights, keyed on mode
// rather than tinted by the primary color (marigold is reserved, not a shadow tint).
function makeShadow(isDark: boolean) {
  return {
    card: {   // tiles, inputs, the active segmented pill
      shadowColor: isDark ? '#000000' : '#3A2C1A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.35 : 0.07,
      shadowRadius: 2, elevation: 1,
    },
    menu: {   // theme menu, spotlight card
      shadowColor: isDark ? '#000000' : '#3A2C1A',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: isDark ? 0.50 : 0.18,
      shadowRadius: 32, elevation: 12,
    },
  };
}

// ─── Themes ───────────────────────────────────────────────────────────────────

export const darkTheme = {
  palette: darkPalette,
  colors: makeColors(darkPalette, true),
  typography: makeTypography(darkPalette.text, darkPalette.textMeta),
  shadow: makeShadow(true),
};

export const lightTheme = {
  palette: lightPalette,
  colors: makeColors(lightPalette, false),
  typography: makeTypography(lightPalette.text, lightPalette.textMeta),
  shadow: makeShadow(false),
};

export type AppTheme = typeof darkTheme;
