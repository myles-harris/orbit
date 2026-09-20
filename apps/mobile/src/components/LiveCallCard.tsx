import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { darkTheme, liveGlow, onPhoto, radius, scrim } from '../theme';
import { Display } from './Display';

interface LiveCallCardProps {
  groupName: string;
  photoUri?: string | null;
  joinedCount: number;
  totalCount: number;
  /**
   * The countdown — text such as "12:04", or a component that renders it and owns
   * its own clock (`<CallTimer/>`), so a tick re-renders that text and not this
   * card. Omit it for a spontaneous call, which has no end time to count toward:
   * the Join pill then takes the row on its own.
   */
  countdown?: ReactNode;
  onJoin: () => void;
}

// The full-bleed, 2-column-span hero card shown when a call is live. Not a
// GroupTile variant — a different band, a different type ramp, a Join pill.
export function LiveCallCard({ groupName, photoUri, joinedCount, totalCount, countdown, onJoin }: LiveCallCardProps) {
  const { theme: { colors } } = useTheme();

  return (
    // The glow lives on an outer view: iOS drops a shadow from any view that also
    // has `overflow: 'hidden'`, which the clipping card below needs.
    <View style={[liveGlow, { borderRadius: radius.xxl, backgroundColor: darkTheme.colors.surface }]}>
      <View style={[styles.card, { borderColor: colors.accent, borderRadius: radius.xxl }]}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            resizeMode="cover"
            style={[StyleSheet.absoluteFillObject, { borderRadius: radius.xxl }]}
          />
        ) : (
          // No photo is still a dark card, in both modes: the cream title and the
          // marigold countdown are only legal over a dark ground (AC-3), and the
          // scrim below would turn a light surface into a muddy brown.
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: darkTheme.colors.surface, borderRadius: radius.xxl },
            ]}
          />
        )}
        <LinearGradient
          colors={scrim.liveCard}
          locations={[0, 0.58, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius.xxl }]}
        />

        <View style={[styles.band, { backgroundColor: colors.accent }]}>
          <Text style={[styles.bandText, { color: colors.onAccent }]}>
            {joinedCount} of {totalCount} joined
          </Text>
        </View>

        <View style={styles.body}>
          <Display
            size={25}
            leading={1.08}
            numberOfLines={2}
            color={onPhoto.title}
            style={onPhoto.textShadowLarge}
          >
            {groupName}
          </Display>

          <View style={[styles.bottomRow, !countdown && styles.bottomRowJoinOnly]}>
            {countdown ? (
              <Display size={28} leading={1} tabular color={colors.accent}>
                {countdown}
              </Display>
            ) : null}
            <TouchableOpacity
              onPress={onJoin}
              activeOpacity={0.85}
              style={[styles.joinPill, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.joinLabel, { color: colors.onAccent }]}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// Heights are minHeights: at 150–200% system text the band and pill grow with
// their label instead of letting it spill over the title.
const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  band: {
    minHeight: 24,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 11,
    letterSpacing: 11 * 0.14,
  },
  body: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // space-between would put a lone Join pill on the left.
  bottomRowJoinOnly: {
    justifyContent: 'flex-end',
  },
  joinPill: {
    minHeight: 48,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinLabel: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 17,
  },
});
