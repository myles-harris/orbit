// Orbit design tokens — mirrors apps/mobile/src/theme.ts (dark mode) + groupColors.ts

const orbitColors = {
  bg:      '#0d0d1c',
  surface: '#14142a',
  surface2:'#1c1c3a',
  border:      '#272748',
  borderLight: '#1e1e38',
  text:          '#e6ddc8',
  textSecondary: '#c0b8a4',
  textTertiary:  '#8a827a',
  primary:        '#6b5fd4',
  primaryDark:    '#524aa8',
  primaryLight:   '#2a2756',
  primaryLighter: '#1c1a3e',
  success:     '#4e9e7e',
  successDark: '#3a7a62',
  danger:      '#b85a56',
};

// Exact palette from apps/mobile/src/utils/groupColors.ts
const CARD_PALETTES = [
  { bg: '#c2bce0', text: '#1e1844' }, // soft iris
  { bg: '#b8d4c4', text: '#133324' }, // sage green
  { bg: '#d4b8b8', text: '#3a1a1a' }, // dusty rose
  { bg: '#b8c8d4', text: '#142030' }, // slate blue
  { bg: '#d4cdb0', text: '#32280c' }, // warm ochre
  { bg: '#c4d0bc', text: '#1a2c16' }, // muted olive
  { bg: '#d4b8cc', text: '#38142e' }, // mauve
  { bg: '#b8d0d0', text: '#0e2828' }, // teal mist
];

// Mirrors defaultPaletteIndex() from groupColors.ts
function hashPaletteIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % CARD_PALETTES.length;
}

// Mirrors getCardHeight() from HomeScreen.tsx
function hashCardHeight(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 17 + name.charCodeAt(i)) & 0xffff;
  return 120 + (h % 80);
}

Object.assign(window, { orbitColors, CARD_PALETTES, hashPaletteIndex, hashCardHeight });
