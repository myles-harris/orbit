import { type ReactNode, useMemo } from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { radius } from '../theme';

interface FieldProps {
  label: string;
  /** Small print under the control. */
  helper?: string;
  children: ReactNode;
}

// A labelled form control: the label above, the control, the helper text below.
// Group Settings and Create Group both build their forms from this.
export function Field({ label, helper, children }: FieldProps) {
  const { theme: { colors } } = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      {children}
      {helper ? <Text style={[styles.helper, { color: colors.textSecondary }]}>{helper}</Text> : null}
    </View>
  );
}

type TextFieldProps = Pick<TextInputProps, 'value' | 'onChangeText' | 'placeholder'> & {
  label: string;
  helper?: string;
};

// The 52pt input. `surface` with a hairline and `shadow.card`: the design carries
// structure in light mode with the rule and shadow, in dark with the surface step.
export function TextField({ label, helper, ...inputProps }: TextFieldProps) {
  const { theme: { colors, shadow } } = useTheme();
  const inputStyle = useMemo(
    () => ({
      backgroundColor: colors.surface,
      borderColor: colors.hairline,
      color: colors.text,
      ...shadow.card,
    }),
    [colors, shadow],
  );

  return (
    <Field label={label} helper={helper}>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, inputStyle]}
      />
    </Field>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'Geist_500Medium',
    fontSize: 13,
    marginBottom: 8,
  },
  helper: {
    fontFamily: 'Geist_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
  },
});
