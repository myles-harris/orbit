import fs from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import Svg, { Path } from 'react-native-svg';
import { OrbitLogo } from '../OrbitLogo';
import { onPhoto } from '../../theme';

const MARIGOLD = '#F6BF10';
const CREAM = '#FFF8E7';

// Where Chrome laid out the design file itself (Orbit Logo.dc.html, its "current defaults", with the
// font its own stack falls through to: Georgia Bold Italic), measured from the DOM: the left edge of
// each letter's box, and the two baselines, all from the top left of the lockup.
const CHROME = {
  width: 187.75,
  lefts: [44.5, 74.75, 104.3438, 132.8906, 152.7813],
  wordBaseline: 98.1769,
  bigBaseline: 169,
};
const WITHIN = 0.02; // Chrome lays out in 1/64ths

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(<OrbitLogo />); });
  return tree;
}

const outer = (tree: ReactTestRenderer) => tree.root.findAllByType(View)[0];
/** The four layers in paint order: a shadow bitmap, the letters behind, a shadow bitmap, the letters in front. */
const layers = (tree: ReactTestRenderer) =>
  outer(tree).findAll((n) => n.type === Image || n.type === Svg, { deep: false });
const isShadow = (layer: ReactTestInstance) => layer.type === Image;
const pathsOf = (layer: ReactTestInstance) => layer.findAllByType(Path);
/** [a, b, c, d, tx, ty]: the SVG matrix that sizes and places one outline. */
const matrix = (glyph: ReactTestInstance) => glyph.props.transform as number[];
/** The x/y bounds of an outline's coordinates (control points included), in font units. */
const bounds = (d: string) => {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};
const UPEM = 2048;

describe('OrbitLogo', () => {
  it("uses the design's marigold and cream", () => {
    expect(onPhoto.accent).toBe(MARIGOLD);
    expect(onPhoto.title).toBe(CREAM);
  });

  it('paints the shadow, the whole word and the O, the shadow again, then RBIT in front', () => {
    const tree = render();

    expect(layers(tree).map((l) => (isShadow(l) ? 'shadow' : 'letters'))).toEqual(['shadow', 'letters', 'shadow', 'letters']);

    const [, behind, , front] = layers(tree);
    expect(pathsOf(behind).map((g) => g.props.fill)).toEqual([CREAM, CREAM, CREAM, CREAM, CREAM, MARIGOLD]);
    expect(pathsOf(front).map((g) => g.props.fill)).toEqual([CREAM, CREAM, CREAM, CREAM]);
    // The same four letters, R B I T, both times.
    expect(pathsOf(front).map((g) => g.props.d)).toEqual(pathsOf(behind).slice(1, 5).map((g) => g.props.d));
  });

  it("keeps the word's own O behind the big one only, so the stroke half-hides it and it never paints over the stroke", () => {
    const [, behind, , front] = layers(render());
    const paths = pathsOf(behind);
    const bigO = paths[5].props.d;

    expect(paths[0].props.d).toBe(bigO); // the word starts with the same O outline, smaller, in cream
    expect(paths[0].props.fill).toBe(CREAM);
    expect(pathsOf(front).some((g) => g.props.d === bigO)).toBe(false);
  });

  it('is as wide as the 229pt O is advanced and as tall as its .78 line box', () => {
    const box = StyleSheet.flatten(outer(render()).props.style);

    expect(Math.abs(box.width - CHROME.width)).toBeLessThan(WITHIN); // Georgia Bold Italic's O advances 1679 of 2048 em
    expect(box.height).toBeCloseTo(178.62, 2); // 229 × .78
  });

  it('sets O R B I T where a browser lays out the design: tracked, centred in what the padding leaves, on one baseline', () => {
    const [, behind, , front] = layers(render());
    const word = pathsOf(behind).slice(0, 5);

    word.forEach((g, i) => expect(Math.abs(matrix(g)[4] - CHROME.lefts[i])).toBeLessThan(WITHIN));
    // In front, the same letters at the same places, minus the O.
    pathsOf(front).forEach((g, i) => expect(matrix(g)[4]).toBeCloseTo(matrix(word[i + 1])[4], 6));
    [...word, ...pathsOf(front)].forEach((g) => expect(Math.abs(matrix(g)[5] - CHROME.wordBaseline)).toBeLessThan(WITHIN));
  });

  it('sets the big O 229 tall on the baseline the browser puts it, at the left edge of the box', () => {
    const bigO = pathsOf(layers(render())[1])[5];

    expect(matrix(bigO)[3]).toBeCloseTo(229 / UPEM, 6); // font units to points
    expect(matrix(bigO)[4]).toBe(0);
    expect(matrix(bigO)[5]).toBe(CHROME.bigBaseline);
  });

  it('sizes the word at 28', () => {
    const [, behind, , front] = layers(render());
    [...pathsOf(behind).slice(0, 5), ...pathsOf(front)].forEach((g) => expect(matrix(g)[3]).toBeCloseTo(28 / UPEM, 6));
  });

  it("does not slant anything: the face is a true italic, and a browser shears nothing that already leans", () => {
    pathsOf(layers(render())[1]).concat(pathsOf(layers(render())[3])).forEach((g) => {
      const [a, b, c, d] = matrix(g);
      expect(a).toBe(d); // uniform scale
      expect(b).toBe(0);
      expect(c).toBe(0);
    });
  });

  it('keeps the big O inside its own box, so its canvas needs no room to spare', () => {
    const tree = render();
    const box = StyleSheet.flatten(outer(tree).props.style);
    const bigO = pathsOf(layers(tree)[1])[5];
    const b = bounds(bigO.props.d);
    const s = matrix(bigO)[3];

    expect(matrix(bigO)[4] + b.minX * s).toBeGreaterThanOrEqual(0);
    expect(matrix(bigO)[4] + b.maxX * s).toBeLessThanOrEqual(box.width);
    expect(matrix(bigO)[5] + b.minY * s).toBeGreaterThanOrEqual(0);
    expect(matrix(bigO)[5] + b.maxY * s).toBeLessThanOrEqual(box.height);
  });

  describe("the word's shadow: 0 1px 3px rgba(58,44,26,.55), on by default in the design", () => {
    const shadows = (tree: ReactTestRenderer) => layers(tree).filter(isShadow);
    const frameOf = (shadow: ReactTestInstance) => StyleSheet.flatten(shadow.props.style);
    const bitmapSize = (asset: string) => {
      const png = fs.readFileSync(path.join(__dirname, '../../../assets', asset));
      return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }; // the IHDR chunk
    };

    it('is a bitmap under each copy of the word, in the same frame, drawn at once', () => {
      const [behind, front] = shadows(render());

      expect(frameOf(behind)).toEqual(frameOf(front));
      expect(frameOf(behind)).toMatchObject({ position: 'absolute', left: 40, top: 72, width: 140, height: 34 });
      // Android fades a bitmap in by default; the shadow must not arrive after the letters.
      [behind, front].forEach((s) => expect(s.props.fadeDuration).toBe(0));
    });

    it("shows each bitmap at a third of its pixels, so it is Chrome's own render at 3x, unscaled on a 3x screen", () => {
      const frame = frameOf(shadows(render())[0]);

      ['orbit-logo-shadow-behind.png', 'orbit-logo-shadow-front.png'].forEach((file) => {
        expect(bitmapSize(file)).toEqual({ width: frame.width * 3, height: frame.height * 3 });
      });
    });

    it('has room for the whole blur: the frame reaches 3σ (4.5) past the letters, down a point for the offset', () => {
      const tree = render();
      const [, behind] = layers(tree);
      const frame = frameOf(shadows(tree)[0]);
      const ink = pathsOf(behind).slice(0, 5).map((g) => {
        const b = bounds(g.props.d);
        const [s, , , , x, baseline] = matrix(g);
        return { l: x + b.minX * s, r: x + b.maxX * s, t: baseline + b.minY * s, b: baseline + b.maxY * s };
      });
      const reach = 4.5;

      expect(frame.left).toBeLessThanOrEqual(Math.min(...ink.map((i) => i.l)) - reach);
      expect(frame.left + frame.width).toBeGreaterThanOrEqual(Math.max(...ink.map((i) => i.r)) + reach);
      expect(frame.top).toBeLessThanOrEqual(Math.min(...ink.map((i) => i.t)) + 1 - reach);
      expect(frame.top + frame.height).toBeGreaterThanOrEqual(Math.max(...ink.map((i) => i.b)) + 1 + reach);
    });
  });

  it('reads as one picture called Orbit, and takes no touches', () => {
    expect(outer(render()).props).toMatchObject({ accessible: true, accessibilityRole: 'image', accessibilityLabel: 'Orbit', pointerEvents: 'none' });
  });
});
