// ─── Static (no theme dependency) ────────────────────────────────────────────
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999,
};

// ─── Palettes ─────────────────────────────────────────────────────────────────
// `cream` is kept identical across modes — AuthScreen overlays a dark gradient
// image regardless of the app theme, so the warm off-white text is always correct.

const darkPalette = {
  iris:    '#6b5fd4',   // calm periwinkle — primary actions
  sage:    '#4e9e7e',   // muted teal — positive / live states
  cream:   '#e6ddc8',   // warm off-white text / AuthScreen overlay
  abyss:   '#0d0d1c',   // near-black background
  surface:  '#14142a',
  surface2: '#1c1c3a',
  border:   '#272748',
  mist:     '#8a827a',  // tertiary text
};

const lightPalette = {
  iris:    '#5b50c0',   // slightly deeper for light-bg contrast
  sage:    '#3d8a6a',
  cream:   '#e6ddc8',   // same — AuthScreen overlay only
  abyss:   '#f4f0e8',   // warm parchment background
  surface:  '#faf8f4',  // warm white cards
  surface2: '#eeeae0',  // slightly deeper parchment
  border:   '#d8d2c8',
  mist:     '#8c8480',
};

type Palette = typeof darkPalette;

// ─── Derived tokens ───────────────────────────────────────────────────────────

function makeColors(p: Palette, isDark: boolean) {
  return {
    primary:        p.iris,
    primaryDark:    isDark ? '#524aa8' : '#4840a0',
    primaryLight:   isDark ? '#2a2756' : '#e8e6f8',
    primaryLighter: isDark ? '#1c1a3e' : '#f0eefe',

    success:      p.sage,
    successLight: isDark ? '#162e24' : '#d8f0e8',
    successDark:  isDark ? '#3a7a62' : '#2a6e52',

    danger:      '#b85a56',
    dangerLight: 'rgba(184, 90, 86, 0.14)',
    dangerDark:  '#904444',

    warning:      isDark ? '#c99460' : '#a06c30',
    warningLight: isDark ? '#2a2016' : '#fdf0e0',

    background:       p.abyss,
    surface:          p.surface,
    surfaceSecondary: p.surface2,

    text:          isDark ? p.cream   : '#1a1828',
    textSecondary: isDark ? '#c0b8a4' : '#4a4558',
    textTertiary:  p.mist,
    textOnPrimary: '#ffffff',

    border:      p.border,
    borderLight: isDark ? '#1e1e38' : '#ece8e0',

    tabActive:   p.iris,
    tabInactive: isDark ? '#6a6280' : '#9090a8',
  };
}

function makeTypography(textColor: string, mutedColor: string) {
  return {
    h1: { fontSize: 34, fontFamily: 'Roboto_700Bold', letterSpacing: -0.5, color: textColor },
    h2: { fontSize: 28, fontFamily: 'Roboto_700Bold', letterSpacing: -0.3, color: textColor },
    h3: { fontSize: 22, fontFamily: 'Roboto_700Bold', letterSpacing: -0.2, color: textColor },
    h4: { fontSize: 18, fontFamily: 'Roboto_700Bold', color: textColor },
    body: { fontSize: 16, fontFamily: 'Roboto_400Regular', color: textColor },
    bodyMedium: { fontSize: 16, fontFamily: 'Roboto_500Medium', color: textColor },
    bodySemibold: { fontSize: 16, fontFamily: 'Roboto_700Bold', color: textColor },
    caption: { fontSize: 14, fontFamily: 'Roboto_400Regular', color: mutedColor },
    captionMedium: { fontSize: 14, fontFamily: 'Roboto_500Medium', color: mutedColor },
    small: { fontSize: 12, fontFamily: 'Roboto_400Regular', color: mutedColor },
    smallMedium: { fontSize: 12, fontFamily: 'Roboto_700Bold', color: mutedColor },
  };
}

function makeShadow(primaryColor: string) {
  return {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 4,
    },
    lg: {
      shadowColor: primaryColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 20,
      elevation: 8,
    },
  };
}

// ─── Themes ───────────────────────────────────────────────────────────────────

export const darkTheme = {
  palette: darkPalette,
  colors: makeColors(darkPalette, true),
  typography: makeTypography(darkPalette.cream, darkPalette.mist),
  shadow: makeShadow(darkPalette.iris),
};

export const lightTheme = {
  palette: lightPalette,
  colors: makeColors(lightPalette, false),
  typography: makeTypography('#1a1828', lightPalette.mist),
  shadow: makeShadow(lightPalette.iris),
};

export type AppTheme = typeof darkTheme;
