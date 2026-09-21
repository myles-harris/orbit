import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

// For screens that put content over a dark photo in both themes (Auth,
// GroupDetail). expo-status-bar merges every mounted instance in mount order,
// and a stack navigator keeps the screen underneath mounted — so an unguarded
// light bar would stay on top of whatever is pushed above it, turning the clock
// cream-on-cream in light mode. Rendering only while focused hands the bar back
// to the app-level, mode-following one as soon as the screen loses focus.
export function LightStatusBar() {
  return useIsFocused() ? <StatusBar style="light" /> : null;
}
