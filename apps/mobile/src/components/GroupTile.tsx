import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { layout, onPhoto, radius, scrim } from '../theme';
import { useGroupPhoto } from '../utils/useGroupPhoto';
import { Display } from './Display';

interface GroupTileProps {
  name: string;
  /** Formatted upstream (e.g. "Daily", "3×/wk") — this component only places it. */
  cadence: string;
  /**
   * "muted" on a surface tile, "call ended 4 minutes ago" on a photo tile —
   * wheat over a photo, textSecondary on a surface.
   */
  subLabel?: string;
  /**
   * The group, and — from `GroupDTO` — whether it has a photo and when that last
   * changed. The tile fetches the image itself: it is behind the group's membership
   * check, so it needs the token and the retry that `useGroupPhoto` carries.
   */
  groupId: string;
  hasPhoto?: boolean;
  photoUpdatedAt?: string | null;
  /**
   * A live call on a group that is not the hero. The live card takes the most
   * recent call; any other live group keeps its square tile and gains a 1px
   * marigold border and a "live" label — the vocabulary the spotlight screen's
   * background tile already uses.
   */
  live?: boolean;
  onPress: () => void;
}

// Owns the photo/no-photo branch — every existing group is in the no-photo
// state on day one, so that fallback is not a degradation, it's the default.
//
// Layout: name (and subLabel) top-left, cadence bottom-right. That is what the
// two scrims in the design imply — one anchored to each edge, `tileTop` behind
// the name and `tileBottom` behind the cadence.
export function GroupTile({
  name, cadence, subLabel, groupId, hasPhoto: groupHasPhoto = false, photoUpdatedAt, live, onPress,
}: GroupTileProps) {
  const { theme: { colors }, mode } = useTheme();
  // Null covers a group with no photo, a token not yet in hand, and a load that failed
  // twice. All three draw the same designed no-photo tile.
  const photo = useGroupPhoto({ groupId, hasPhoto: groupHasPhoto, photoUpdatedAt });
  const hasPhoto = photo !== null;
  // Marigold text is legal only over a dark ground (AC-3): a photo scrim in either
  // mode, or the dark surface. On the light surface it is 1.60:1, so the label
  // falls back to `text` there and the marigold border carries the signal alone.
  const liveLabelColor = hasPhoto ? onPhoto.accent : mode === 'dark' ? colors.accent : colors.text;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.tile,
        {
          borderRadius: radius.xl,
          backgroundColor: hasPhoto ? colors.background : colors.surface,
          borderWidth: hasPhoto && !live ? 0 : 1,
          borderColor: live ? colors.accent : colors.hairline,
        },
      ]}
    >
      {photo && (
        <>
          <Image
            key={photo.imageKey}
            source={photo.source}
            onError={photo.onError}
            resizeMode="cover"
            // Android clips a radius+gradient stack inconsistently unless every
            // layer — tile, gradient, image — carries its own borderRadius.
            style={[StyleSheet.absoluteFillObject, { borderRadius: radius.xl }]}
          />
          <LinearGradient
            colors={scrim.tileTop}
            locations={[0, 0.52, 1]}
            style={[StyleSheet.absoluteFillObject, { borderRadius: radius.xl }]}
          />
          {/* Anchored to the bottom edge: the first stop is the dense one, so the
              gradient has to start there. expo-linear-gradient defaults to top→bottom. */}
          <LinearGradient
            colors={scrim.tileBottom}
            locations={[0, 0.3, 0.55]}
            start={{ x: 0.5, y: 1 }}
            end={{ x: 0.5, y: 0 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: radius.xl }]}
          />
        </>
      )}

      <View style={styles.textBlock}>
        <Display
          size={19}
          leading={1.15}
          numberOfLines={3}
          ellipsizeMode="tail"
          color={hasPhoto ? onPhoto.title : colors.text}
          style={hasPhoto ? onPhoto.textShadow : undefined}
        >
          {name}
        </Display>
        {subLabel ? (
          <Text
            numberOfLines={1}
            style={[
              styles.subLabel,
              { color: hasPhoto ? onPhoto.sub : colors.textSecondary },
              hasPhoto ? onPhoto.textShadow : undefined,
            ]}
          >
            {subLabel}
          </Text>
        ) : null}
      </View>

      {live ? (
        <Text
          style={[styles.liveLabel, { color: liveLabelColor }, hasPhoto ? onPhoto.textShadow : undefined]}
        >
          live
        </Text>
      ) : null}

      <Text
        style={[
          styles.cadence,
          { color: hasPhoto ? onPhoto.meta : colors.textMeta },
          hasPhoto ? onPhoto.textShadow : undefined,
        ]}
      >
        {cadence}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    aspectRatio: 1,
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: layout.tilePad,
  },
  textBlock: {
    gap: 2,
  },
  subLabel: {
    fontFamily: 'Geist_400Regular',
    fontSize: 12.5,
  },
  cadence: {
    alignSelf: 'flex-end',
    fontFamily: 'GeistMono_500Medium',
    fontSize: 13,
  },
  // Out of flow, on the cadence's baseline, so the label never changes how the name
  // and cadence slots lay out. (The 1px border a live photo tile gains does inset its
  // content by 1px against photo neighbours — that is the border, not the label.)
  liveLabel: {
    position: 'absolute',
    left: layout.tilePad,
    bottom: layout.tilePad,
    fontFamily: 'GeistMono_500Medium',
    fontSize: 13,
  },
});
