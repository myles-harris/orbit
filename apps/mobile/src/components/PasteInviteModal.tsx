import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout, radius, scrim } from '../theme';
import { parseInviteCode } from '../utils/inviteLink';

interface PasteInviteModalProps {
  visible: boolean;
  onClose: () => void;
  /** The invite code parsed out of whatever was pasted. */
  onSubmit: (code: string) => void;
}

// "Paste an invite link instead" needs somewhere to paste. A text field takes the
// system paste on both platforms, so this ships without a clipboard module — and
// therefore without a native build. The confirm action is outlined, not marigold:
// the screen behind already carries its one primary action.
export function PasteInviteModal({ visible, onClose, onSubmit }: PasteInviteModalProps) {
  const { theme: { colors, shadow } } = useTheme();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  const close = () => {
    setText('');
    setInvalid(false);
    onClose();
  };

  const submit = () => {
    const code = parseInviteCode(text);
    if (!code) {
      setInvalid(true);
      return;
    }
    setText('');
    setInvalid(false);
    onSubmit(code);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: scrim.spotlight[0] }]}
      >
        {/* Tap outside to dismiss. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />

        <View style={[styles.card, shadow.menu, { backgroundColor: colors.surface, borderColor: colors.hairline }]}>
          <Text style={[styles.title, { color: colors.text }]}>Paste an invite link</Text>

          <TextInput
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (invalid) setInvalid(false);
            }}
            onSubmitEditing={submit}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            placeholder="orbit://invite/…"
            placeholderTextColor={colors.textSecondary}
            selectionColor={colors.text}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.background,
                borderColor: invalid ? colors.danger : colors.borderStrong,
              },
            ]}
          />
          {invalid ? (
            <Text style={[styles.error, { color: colors.danger }]}>That doesn't look like an invite link.</Text>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity onPress={close} activeOpacity={0.7} style={styles.cancel}>
              <Text style={[styles.cancelLabel, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              activeOpacity={0.7}
              style={[styles.confirm, { borderColor: colors.borderStrong }]}
            >
              <Text style={[styles.confirmLabel, { color: colors.text }]}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPad,
  },
  card: {
    padding: 20,
    gap: 12,
    borderRadius: radius.xxl,
    borderWidth: 1,
  },
  title: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 17,
  },
  input: {
    minHeight: layout.primaryBtn,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
  },
  error: {
    fontFamily: 'Geist_400Regular',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  cancel: {
    minHeight: layout.touchMin,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontFamily: 'Geist_500Medium',
    fontSize: 15,
  },
  confirm: {
    minHeight: layout.touchMin,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLabel: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 15,
  },
});
