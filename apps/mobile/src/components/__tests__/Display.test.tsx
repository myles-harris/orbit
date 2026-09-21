import { act, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { Display } from '../Display';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

/** The one host <Text> Display draws, with its style flattened. */
function drawn(element: ReactElement) {
  (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(element); });
  const text = tree.root.findAll((n) => (n.type as unknown) === 'Text')[0];
  return StyleSheet.flatten(text.props.style) as Record<string, any>;
}

describe('Display', () => {
  it('is Cinzel 700, in capitals', () => {
    expect(drawn(<Display size={19}>Track Club</Display>)).toMatchObject({
      fontFamily: 'Cinzel_700Bold',
      textTransform: 'uppercase',
    });
  });

  it('draws the italic as a 14° shear of the upright: Cinzel has no italic face, and fontStyle would differ by platform', () => {
    const style = drawn(<Display size={19}>Track Club</Display>);

    expect(style.transform).toEqual([{ skewX: '-14deg' }]);
    expect(style.fontStyle).toBeUndefined();
  });

  it("takes the design file's size as written: Cinzel needs no optical correction", () => {
    expect(drawn(<Display size={19} leading={1.15}>Track Club</Display>)).toMatchObject({
      fontSize: 19,
      lineHeight: 22, // 19 × 1.15, rounded
    });
  });

  it('lets a caller set the colour and add a shadow without losing the slant', () => {
    const style = drawn(
      <Display size={19} color="#FFF8E7" style={{ textShadowRadius: 4 }}>Track Club</Display>,
    );

    expect(style).toMatchObject({ color: '#FFF8E7', textShadowRadius: 4, transform: [{ skewX: '-14deg' }] });
  });
});
