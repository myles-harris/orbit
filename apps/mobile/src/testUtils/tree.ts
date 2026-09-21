// Helpers for reading a react-test-renderer tree. Deliberately outside `__tests__`,
// which jest collects as suites.
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import NumberPicker from '../components/NumberPicker';

/** All the text under a node, joined. */
export const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

/** The rendered text of every host <Text>, in tree order. */
export const allText = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => textOf(n));

/** What a NumberPicker draws in its readout, by the same rule it uses. */
const readoutOf = (picker: ReactTestInstance): string =>
  picker.props.formatValue
    ? picker.props.formatValue(picker.props.value)
    : picker.props.suffix
      ? `${picker.props.value} ${picker.props.suffix}`
      : String(picker.props.value);

/** The stepper whose readout currently shows `readout`. */
export const stepperShowing = (tree: ReactTestRenderer, readout: string): ReactTestInstance =>
  tree.root.findAllByType(NumberPicker).find((p) => readoutOf(p) === readout)!;
