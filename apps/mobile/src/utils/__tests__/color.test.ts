import { withAlpha } from '../color';

describe('withAlpha', () => {
  it('appends the alpha as a byte', () => {
    expect(withAlpha('#211A12', 0)).toBe('#211A1200');
    expect(withAlpha('#211A12', 0.5)).toBe('#211A1280'); // 127.5 rounds up to 128
    expect(withAlpha('#211A12', 1)).toBe('#211A12ff');
  });

  it('zero-pads a small alpha, so the result is always 8 digits', () => {
    expect(withAlpha('#FFF8E7', 0.02)).toBe('#FFF8E705');
  });

  it.each(['rgba(33,26,18,.5)', '#FFF', '#GGGGGG', '211A12', '#211A1280', ''])(
    'refuses %p rather than emit a colour React Native would render wrong',
    (bad) => {
      expect(() => withAlpha(bad, 0.5)).toThrow(/#RRGGBB/);
    },
  );

  it.each([-0.1, 1.1, NaN, Infinity])('refuses an alpha of %p', (bad) => {
    expect(() => withAlpha('#211A12', bad)).toThrow(/alpha/);
  });
});
