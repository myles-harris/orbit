import { darkTheme, lightTheme } from '../theme';

// Both tokens are derived from the palette rather than typed out, so a palette edit
// moves them. These pin the values the design needs today; if a palette change
// moves them on purpose, this is the place that says so.
describe('derived colour tokens', () => {
  it('backgroundClear is the page colour at zero alpha — the clear end of a fade into it', () => {
    expect(darkTheme.colors.backgroundClear).toBe('#211A1200');
    expect(lightTheme.colors.backgroundClear).toBe('#FFF8E700');
  });

  it('backgroundClear shares the background’s RGB, so a fade through it never greys', () => {
    for (const { colors } of [darkTheme, lightTheme]) {
      expect(colors.backgroundClear.slice(0, 7).toLowerCase()).toBe(colors.background.toLowerCase());
    }
  });

  it('dangerBorder is danger at half alpha — the design’s rgba(danger,.5)', () => {
    expect(darkTheme.colors.dangerBorder).toBe('#D98A7280');
    expect(lightTheme.colors.dangerBorder).toBe('#8C3A2A80');
  });

  // Behind the call spotlight, over the blur. The design's own two values, not derived.
  it('overlayScrim is the espresso wash the spotlight sits on: .20 in light, .34 in dark', () => {
    expect(lightTheme.colors.overlayScrim).toBe('rgba(58,44,26,.20)');
    expect(darkTheme.colors.overlayScrim).toBe('rgba(58,44,26,.34)');
  });
});
