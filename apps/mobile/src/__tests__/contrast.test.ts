import { darkTheme, lightTheme } from '../theme';

// ─── Colour maths ─────────────────────────────────────────────────────────────

interface Rgba { r: number; g: number; b: number; a: number }

/** `#RRGGBB`, `#RRGGBBAA` or `rgba(r,g,b,a)` — the three forms the palette is written in. */
function parse(colour: string): Rgba {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(colour);
  if (hex) {
    return {
      r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16),
      a: hex[4] ? parseInt(hex[4], 16) / 255 : 1,
    };
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(colour);
  if (rgba) return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: Number(rgba[4]) };
  throw new Error(`cannot parse colour "${colour}"`);
}

/**
 * What is actually on screen: `top` laid over `under`. A translucent fill has no
 * contrast of its own — it is the colour it makes with whatever is beneath it — so a
 * pair measured against the fill's *flat* value is measured against a colour nobody
 * sees.
 */
function composite(top: string, under: string): Rgba {
  const t = parse(top);
  const u = parse(under);
  if (u.a !== 1) throw new Error(`"${under}" is not opaque; composite the layers beneath it first`);
  const mix = (f: number, b: number) => f * t.a + b * (1 - t.a);
  return { r: mix(t.r, u.r), g: mix(t.g, u.g), b: mix(t.b, u.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rgbaToHex({ r, g, b }: Rgba): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ─── The tests ────────────────────────────────────────────────────────────────

const AA_TEXT = 4.5;
const AA_LARGE_OR_INACTIVE = 3;

describe('composited contrast maths', () => {
  it('composites a translucent fill over its ground instead of reading its flat value', () => {
    // 16% marigold over white is a pale yellow, nowhere near marigold itself:
    // r 246·.16 + 255·.84 = 253.6, g 191·.16 + 255·.84 = 244.8, b 16·.16 + 255·.84 = 216.8.
    const wash = composite('rgba(246,191,16,.16)', '#FFFFFF');
    expect(rgbaToHex(wash)).toBe('#fef5d9');
    expect(contrast(parse('#FFFFFF'), parse('#000000'))).toBeCloseTo(21, 5);
  });

  it('agrees with the palette\'s own documented anchors', () => {
    // 00-CONTEXT: espresso on marigold is 7.96:1, marigold on cream is 1.60:1.
    expect(contrast(parse('#3A2C1A'), parse('#F6BF10'))).toBeCloseTo(7.96, 1);
    expect(contrast(parse('#F6BF10'), parse('#FFF8E7'))).toBeCloseTo(1.6, 1);
  });
});

// T16 — every text/background pair AC-11 names that sits on a translucent fill, measured
// against the fill *composited* over what is beneath it. T1 covered flat pairs only,
// which is how an inert label that failed on its real background went unnoticed.
describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
] as const)('T16 — contrast on composited backgrounds (%s)', (_name, theme) => {
  const { colors } = theme;

  describe('the invite row: accentSoft over the page', () => {
    const ground = composite(colors.accentSoft, colors.background);

    it('is not the flat accentSoft — it is the wash it makes over the background', () => {
      expect(rgbaToHex(ground)).not.toBe(rgbaToHex(parse(colors.accentSoft)));
    });

    it('carries the group name (text) at AA', () => {
      expect(contrast(parse(colors.text), ground)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    // KNOWN DEFECT, found by this test: in dark, textSecondary (#B08A5E) on the invite
    // row's wash reads 4.41:1 — under AA's 4.5 for the 13pt "Invited by …" line and the
    // 15pt Decline label. The palette's 4.80 / 5.44 figures were measured on flat
    // surfaces; 10% marigold over #211A12 lifts the ground enough to cost the difference.
    // Light passes. Not fixed here because both remedies are the design owner's call:
    // nudge dark `textSecondary` (moves AC-11's documented 3.78:1 inert-label figure),
    // or draw those two labels in `textMeta` (wheat, 8.31:1 — but a test pins Decline to
    // textSecondary). `it.failing` passes only while this is true, so fixing it turns
    // this red and the fix is to delete `.failing`.
    const knownDark = theme === darkTheme;
    (knownDark ? it.failing : it)('carries "Invited by …" and Decline (textSecondary) at AA', () => {
      expect(contrast(parse(colors.textSecondary), ground)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it('carries Later (text) at AA', () => {
      expect(contrast(parse(colors.text), ground)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });

  describe('the selected theme-menu row: accentSoft over the menu surface', () => {
    const ground = composite(colors.accentSoft, colors.surface);

    it('carries the selected label (text) at AA', () => {
      expect(contrast(parse(colors.text), ground)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it('carries the option glyph (textSecondary) and the check (text) at the 3:1 a graphic needs', () => {
      expect(contrast(parse(colors.textSecondary), ground)).toBeGreaterThanOrEqual(AA_LARGE_OR_INACTIVE);
      expect(contrast(parse(colors.text), ground)).toBeGreaterThanOrEqual(AA_LARGE_OR_INACTIVE);
    });
  });

  describe('the inert button track: controlTrack over the bar\'s background', () => {
    // "Save changes" and "New group" are the same disabled BottomActionBar button, so
    // one pair stands for both.
    const track = composite(colors.controlTrack, colors.background);

    it('holds the inert label (textSecondary) at 3:1, the floor WCAG 1.4.3 leaves an inactive control', () => {
      expect(contrast(parse(colors.textSecondary), track)).toBeGreaterThanOrEqual(AA_LARGE_OR_INACTIVE);
    });

    it('is not measured against the flat track colour, which would read a different number', () => {
      const flatTrack = parse(colors.controlTrack); // wrong on purpose: alpha dropped
      const flatAsOpaque = { ...flatTrack, a: 1 };
      expect(contrast(parse(colors.textSecondary), flatAsOpaque)).not.toBeCloseTo(
        contrast(parse(colors.textSecondary), track), 1,
      );
    });
  });
});

// The figures 00-CONTEXT AC-11 gives for the inert label. Pinned separately from the
// 3:1 floor above so a palette edit that moves them is a visible, deliberate change.
describe('AC-11 documented figures for the inert label', () => {
  it('reads 3.78:1 in dark', () => {
    const track = composite(darkTheme.colors.controlTrack, darkTheme.colors.background);
    expect(contrast(parse(darkTheme.colors.textSecondary), track)).toBeCloseTo(3.78, 1);
  });

  it('reads 4.50:1 in light', () => {
    const track = composite(lightTheme.colors.controlTrack, lightTheme.colors.background);
    expect(contrast(parse(lightTheme.colors.textSecondary), track)).toBeCloseTo(4.5, 1);
  });
});
