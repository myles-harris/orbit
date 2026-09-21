import { act } from 'react';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { CadenceFields } from '../CadenceFields';
import { SegmentedControl } from '../SegmentedControl';
import { useTheme } from '../../context/ThemeContext';
import { allText, stepperShowing } from '../../testUtils/tree';
import { darkTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

interface Handlers {
  onCadenceChange: jest.Mock;
  onFrequencyChange: jest.Mock;
  onDurationChange: jest.Mock;
}

async function render(
  props: Partial<React.ComponentProps<typeof CadenceFields>> = {},
): Promise<{ tree: ReactTestRenderer } & Handlers> {
  (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
  const handlers = { onCadenceChange: jest.fn(), onFrequencyChange: jest.fn(), onDurationChange: jest.fn() };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <CadenceFields cadence="daily" frequency={1} duration={5} {...handlers} {...props} />,
    );
  });
  return { tree, ...handlers };
}

describe('CadenceFields', () => {
  it('offers Daily and Weekly, with the current cadence selected', async () => {
    const { tree } = await render({ cadence: 'weekly' });
    const control = tree.root.findByType(SegmentedControl);
    expect(control.props.options.map((o: { label: string }) => o.label)).toEqual(['Daily', 'Weekly']);
    expect(control.props.value).toBe('weekly');
  });

  it('says a daily group calls once a day, and has no weekly count', async () => {
    const { tree } = await render({ cadence: 'daily' });
    const text = allText(tree);
    expect(text).toContain('One call per day.');
    expect(text).not.toContain('Calls per week');
  });

  it('shows a weekly count between the cadence and the duration, and drops the daily helper', async () => {
    const { tree } = await render({ cadence: 'weekly', frequency: 3 });
    const text = allText(tree);

    expect(text).not.toContain('One call per day.');
    expect(text.indexOf('Calls per week')).toBeGreaterThan(text.indexOf('Call frequency'));
    expect(text.indexOf('Calls per week')).toBeLessThan(text.indexOf('Call duration'));
    expect(stepperShowing(tree, '3').props).toMatchObject({ min: 1, max: 6, accessibilityLabel: 'Calls per week' });
  });

  // The rule that used to live, twice, in each screen's handleCadenceChange.
  it('starts a new cadence from one call, whatever the old one was set to', async () => {
    const { tree, onCadenceChange, onFrequencyChange } = await render({ cadence: 'weekly', frequency: 5 });
    act(() => { tree.root.findByType(SegmentedControl).props.onChange('daily'); });

    expect(onCadenceChange).toHaveBeenCalledWith('daily');
    expect(onFrequencyChange).toHaveBeenCalledWith(1);
    // Cadence first, then the reset — as the screens did.
    expect(onCadenceChange.mock.invocationCallOrder[0]).toBeLessThan(onFrequencyChange.mock.invocationCallOrder[0]);
  });

  it('leaves everything alone when the already-selected segment is tapped again', async () => {
    const { tree, onCadenceChange, onFrequencyChange } = await render({ cadence: 'weekly', frequency: 5 });
    act(() => { tree.root.findByType(SegmentedControl).props.onChange('weekly'); });

    // Re-tapping "Weekly" must not throw away the 5 calls a week.
    expect(onCadenceChange).not.toHaveBeenCalled();
    expect(onFrequencyChange).not.toHaveBeenCalled();
  });

  it('draws the duration stepper wide, in minutes, labelled, from 2 to the usual 30', async () => {
    const { tree } = await render({ duration: 10 });
    expect(stepperShowing(tree, '10 min').props).toMatchObject({
      min: 2,
      max: 30,
      wide: true,
      accessibilityLabel: 'Call duration',
    });
  });

  it('lets a group already saved above the usual cap keep its true ceiling', async () => {
    const { tree } = await render({ duration: 45, durationCeiling: 45 });
    expect(stepperShowing(tree, '45 min').props.max).toBe(45);
  });

  it('reports each stepper to its own handler', async () => {
    const { tree, onFrequencyChange, onDurationChange } = await render({ cadence: 'weekly', frequency: 2, duration: 5 });
    act(() => { stepperShowing(tree, '2').props.onChange(3); });
    act(() => { stepperShowing(tree, '5 min').props.onChange(8); });

    expect(onFrequencyChange).toHaveBeenCalledWith(3);
    expect(onDurationChange).toHaveBeenCalledWith(8);
  });
});
