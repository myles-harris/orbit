import { useEffect } from 'react';
import {
  AccessibilityInfo, BackHandler, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GroupDTO } from '@orbit/shared';
import { useTheme } from '../context/ThemeContext';
import { darkTheme, layout, onPhoto, radius, scrim } from '../theme';
import { LiveCall, hasCountdown } from '../utils/liveCalls';
import { formatTimeOfDay } from '../utils/timeFormat';
import { useGroupPhoto } from '../utils/useGroupPhoto';
import { CallTimer } from './CallTimer';
import { Display } from './Display';

// expo-blur's scale is 0–100, not pixels, so the design's `blur(7px)` has no direct
// value. 25 is the starting point the brief names; tune it by eye against the mockup.
const BLUR_INTENSITY = 25;

interface CallSpotlightProps {
  call: LiveCall;
  group: Pick<GroupDTO, 'id' | 'name' | 'member_count' | 'has_photo' | 'photo_updated_at'>;
  /** False while Home is blurred: the timer's clock stops and reads fresh on return. */
  active: boolean;
  onJoin: () => void;
  onDismiss: () => void;
}

/**
 * The overlay Home raises when it opens on a call that is live: the list blurred and
 * dimmed behind, the group's card lifted above it. Home decides *whether* (once per
 * mount, and never again after Join or Dismiss); this draws it.
 *
 * In the tree rather than a `Modal`: a Modal is a separate window, and on Android a
 * blur cannot sample content from another window. That leaves this component to do
 * what a Modal does for free — take the hardware back button, and hold screen-reader
 * focus (`accessibilityViewIsModal`; Home hides its own content from Android).
 *
 * The timer slot is always drawn, because the card's composition is built around it:
 * a scheduled call counts down and says when it ends; any other counts up from when
 * it started and has no "Ends at" line to say. Which direction is `CallTimer`'s call.
 */
export function CallSpotlight({ call, group, active, onJoin, onDismiss }: CallSpotlightProps) {
  const { theme: { colors, shadow }, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const photo = useGroupPhoto({ groupId: group.id, hasPhoto: group.has_photo, photoUpdatedAt: group.photo_updated_at });

  // Home hides everything behind this from a screen reader, so without a word from the
  // overlay itself the user would hear nothing at all. `accessibilityViewIsModal` traps
  // focus but does not move or announce it the way a real Modal does.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${group.name}: a call is in progress`);
  }, [group.id]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true; // taken: back closes the overlay, it does not leave Home
    });
    return () => subscription.remove();
  }, [onDismiss]);

  return (
    // The VoiceOver escape gesture (two-finger scrub) is a Modal's "close", so it is this
    // overlay's too.
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={onDismiss}>
      {/* Android's default blur method is a plain tint; the real one is experimental
          in expo-blur 15, so it is left off. There the scrim alone recesses the list. */}
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={mode === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlayScrim }]} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + layout.screenPad, paddingBottom: insets.bottom + layout.screenPad },
        ]}
        // At large text sizes the card can outgrow a short screen; it must scroll
        // rather than push Join or Dismiss off it.
        showsVerticalScrollIndicator={false}
      >
        {/* The shadow lives on an outer view: iOS drops it from a view that also has
            `overflow: 'hidden'`, which the clipping card below needs. */}
        <View style={[shadow.menu, { borderRadius: radius.huge, backgroundColor: darkTheme.colors.surface }]}>
          <View style={styles.card}>
            {photo ? (
              <Image
                key={photo.imageKey}
                source={photo.source}
                onError={photo.onError}
                resizeMode="cover"
                style={[StyleSheet.absoluteFillObject, { borderRadius: radius.huge }]}
              />
            ) : (
              // No photo is still a dark card in both modes: the cream title and the
              // marigold timer are only legal over a dark ground (AC-3).
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  { backgroundColor: darkTheme.colors.surface, borderRadius: radius.huge },
                ]}
              />
            )}
            <LinearGradient
              colors={scrim.spotlight}
              locations={[0, 0.46, 1]}
              style={[StyleSheet.absoluteFillObject, { borderRadius: radius.huge }]}
            />

            <View style={styles.body}>
              <Display size={32} leading={1.05} numberOfLines={3} color={onPhoto.title} style={onPhoto.textShadowLarge}>
                {group.name}
              </Display>

              {/* A bare "12:04" does not say which way it is running. */}
              <Display
                size={52}
                leading={1}
                tabular
                color={onPhoto.accent}
                style={styles.timer}
                accessibilityHint={hasCountdown(call) ? 'Time remaining' : 'Time since the call started'}
              >
                <CallTimer call={call} active={active} />
              </Display>

              <Text style={[styles.count, onPhoto.textShadow]}>
                {call.participant_count} of {group.member_count} on the call
              </Text>

              <TouchableOpacity
                onPress={onJoin}
                activeOpacity={0.85}
                accessibilityRole="button"
                style={[styles.join, { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.joinLabel, { color: colors.onAccent }]}>Join the call</Text>
              </TouchableOpacity>

              {/* Only a call with a fixed end has one to show — nothing stands in for it. */}
              {hasCountdown(call) ? (
                <Text style={[styles.endsAt, onPhoto.textShadow]}>Ends at {formatTimeOfDay(call.ends_at)}</Text>
              ) : null}

              <TouchableOpacity
                onPress={onDismiss}
                activeOpacity={0.7}
                accessibilityRole="button"
                style={styles.dismiss}
              >
                <Text style={[styles.dismissLabel, onPhoto.textShadow]}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// Appendix B: the card sits 20pt in from each side with 26/24/22 padding. Its 278pt
// offset is the mockup's, and becomes centring here: a fixed top offset would push the
// buttons off a short screen. Heights are minHeights, so text growth never clips a label.
const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPad,
  },
  card: {
    overflow: 'hidden',
    borderRadius: radius.huge,
  },
  body: {
    paddingTop: 26,
    paddingHorizontal: 24,
    paddingBottom: 22,
    gap: 4,
  },
  // Left-aligned in a column of its own: the timer gains a digit at 9:59 → 10:00 (or
  // loses one counting down), and nothing shares its row to be pushed by that.
  timer: {
    marginTop: 10,
  },
  count: {
    fontFamily: 'Gelasio_400Regular',
    fontSize: 16,
    color: onPhoto.sub,
  },
  join: {
    minHeight: 56,
    marginTop: 18,
    paddingVertical: 8,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinLabel: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 18,
  },
  endsAt: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Gelasio_400Regular',
    fontSize: 14,
    color: onPhoto.sub,
  },
  dismiss: {
    minHeight: layout.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLabel: {
    fontFamily: 'Geist_500Medium',
    fontSize: 16,
    color: onPhoto.meta,
  },
});
