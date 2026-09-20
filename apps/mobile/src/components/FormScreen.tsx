import { type ReactNode, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout, spacing } from '../theme';
import { BottomActionBar } from './BottomActionBar';
import { FormHeader } from './FormHeader';

interface FormScreenProps {
  title: string;
  onBack: () => void;
  /** The one primary action, in the bottom bar. */
  action: { label: string; onPress: () => void; disabled?: boolean; caption?: string };
  /** False while a gesture inside the form, such as the call-window dial, needs the touch. */
  scrollEnabled?: boolean;
  children: ReactNode;
}

// The shell of a form screen — Group Settings and Create Group: a keyboard-avoiding
// column of header, scrolling fields, and the bottom action bar.
export function FormScreen({ title, onBack, action, scrollEnabled = true, children }: FormScreenProps) {
  const { theme: { colors } } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FormHeader title={title} onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
      >
        {children}
      </ScrollView>
      <BottomActionBar {...action} />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors']) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: layout.screenPad,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xl,
      gap: spacing.xl,
    },
  });
}
