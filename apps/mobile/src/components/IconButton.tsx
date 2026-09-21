import { StyleSheet, TouchableOpacity } from 'react-native';
import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  name: IconName;
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
}

// A bare glyph on a 52×44 target — the design's back and settings buttons. The
// caller picks the colour: cream over a photo, `text` over a plain surface.
export function IconButton({ name, color, onPress, accessibilityLabel }: IconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.button}
    >
      <Icon name={name} size={22} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
