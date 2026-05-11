import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { CARD_PALETTES } from '../utils/groupColors';

interface Props {
  kind: string;
  onTap: () => void;
}

// Expanding ring pulse — native-driver scale + opacity loop
function Pulsing({
  onPress,
  borderRadius = 12,
  style,
  children,
}: {
  onPress: () => void;
  borderRadius?: number;
  style?: object;
  children: React.ReactNode;
}) {
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [ring]);

  return (
    <View style={style}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: 2,
            borderColor: '#6b5fd4',
            transform: [
              { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
            ],
            opacity: ring.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.65, 0] }),
          },
        ]}
      />
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {children}
      </TouchableOpacity>
    </View>
  );
}

export default function TutorialDemo({ kind, onTap }: Props) {
  const { theme: { colors } } = useTheme();
  const palettes = CARD_PALETTES;

  // ── Sub-components ─────────────────────────────────────────────────────────

  const FilterPill = ({
    label,
    active,
    badge,
    onPress,
  }: {
    label: string;
    active?: boolean;
    badge?: string;
    onPress?: () => void;
  }) => {
    const pill = (
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingVertical: 4, paddingHorizontal: 11, borderRadius: 999,
        backgroundColor: active ? colors.text : colors.background,
      }}>
        <Text style={{
          fontFamily: 'Roboto_700Bold', fontSize: 12,
          color: active ? colors.background : colors.textSecondary,
        }}>{label}</Text>
        {badge && (
          <View style={{
            backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.primary,
            borderRadius: 999, minWidth: 14, height: 14, paddingHorizontal: 3,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#fff', fontSize: 8, fontFamily: 'Roboto_700Bold' }}>{badge}</Text>
          </View>
        )}
      </View>
    );
    if (onPress) {
      return <Pulsing onPress={onPress} borderRadius={999}>{pill}</Pulsing>;
    }
    return pill;
  };

  const FilterRow = ({ activeTab }: { activeTab?: string }) => (
    <View style={{
      flexDirection: 'row', gap: 5, padding: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    }}>
      {['All', 'Daily', 'Weekly', 'Invited'].map(tab => (
        <FilterPill key={tab} label={tab} active={activeTab === tab} />
      ))}
    </View>
  );

  const BentoCard = ({
    name, cadence, palette, height, tappable,
  }: {
    name: string; cadence: string; palette: typeof palettes[0]; height: number; tappable?: boolean;
  }) => {
    const content = (
      <View style={{
        backgroundColor: palette.bg, borderRadius: 10, padding: 8,
        height, justifyContent: 'space-between',
      }}>
        <View style={{
          alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.10)',
          paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
        }}>
          <Text style={{ fontSize: 9, fontFamily: 'Roboto_700Bold', color: palette.text }}>{cadence}</Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: 'Roboto_700Bold', color: palette.text, lineHeight: 15 }}>{name}</Text>
      </View>
    );
    if (tappable) {
      return <Pulsing onPress={onTap} borderRadius={10}>{content}</Pulsing>;
    }
    return content;
  };

  const MemberRow = ({
    username, isOwner, isLast, pulseBadge,
  }: {
    username: string; isOwner?: boolean; isLast?: boolean; pulseBadge?: boolean;
  }) => (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: 10, paddingHorizontal: 12,
      borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    }}>
      <View style={{
        width: 30, height: 30, borderRadius: 8,
        backgroundColor: isOwner ? colors.primary : colors.primaryLight,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{
          fontSize: 12, fontFamily: 'Roboto_700Bold',
          color: isOwner ? '#fff' : colors.primary,
        }}>
          {username.charAt(0).toUpperCase()}
        </Text>
      </View>
      <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Roboto_500Medium', color: colors.text }}>
        {username}
      </Text>
      {isOwner && (
        pulseBadge ? (
          <Pulsing onPress={onTap} borderRadius={999}>
            <View style={{
              backgroundColor: colors.primaryLighter, paddingHorizontal: 8,
              paddingVertical: 2, borderRadius: 999,
            }}>
              <Text style={{ fontSize: 9, fontFamily: 'Roboto_700Bold', color: colors.primary }}>Owner</Text>
            </View>
          </Pulsing>
        ) : (
          <View style={{
            backgroundColor: colors.primaryLighter, paddingHorizontal: 8,
            paddingVertical: 2, borderRadius: 999,
          }}>
            <Text style={{ fontSize: 9, fontFamily: 'Roboto_700Bold', color: colors.primary }}>Owner</Text>
          </View>
        )
      )}
    </View>
  );

  // ── Demos ──────────────────────────────────────────────────────────────────

  if (kind === 'welcome') {
    return (
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <Text style={{ fontFamily: 'Chango_400Regular', fontSize: 46, color: colors.text, lineHeight: 50 }}>
          orbit
        </Text>
        <View style={{ width: 130, height: 90, alignItems: 'center', justifyContent: 'center' }}>
          {[130, 84, 42].map((size, i) => (
            <View key={i} style={{
              position: 'absolute',
              width: size, height: size, borderRadius: size / 2,
              borderWidth: 1.5,
              borderColor: i === 2 ? colors.primary : 'rgba(230,221,200,0.12)',
              backgroundColor: i === 2 ? 'rgba(107,95,212,0.10)' : 'transparent',
            }} />
          ))}
          {/* Orbiting dot */}
          <View style={{
            position: 'absolute', top: 4,
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: colors.primary,
          }} />
          {/* Centre dot */}
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary }} />
        </View>
        <Text style={{
          fontFamily: 'RobotoMono_500Medium', fontSize: 10, color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.6,
        }}>
          video calls that just happen
        </Text>
      </View>
    );
  }

  if (kind === 'create') {
    return (
      <View style={{
        backgroundColor: colors.background, borderRadius: 14, overflow: 'hidden', height: 200,
      }}>
        <FilterRow activeTab="All" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Ionicons name="ellipse-outline" size={28} color={colors.textTertiary} />
          <Text style={{ fontSize: 13, fontFamily: 'Roboto_700Bold', color: colors.textSecondary }}>
            No groups yet
          </Text>
          <Text style={{ fontSize: 11, fontFamily: 'Roboto_400Regular', color: colors.textTertiary }}>
            Tap + to create your first group
          </Text>
        </View>
        {/* FAB */}
        <Pulsing
          onPress={onTap}
          borderRadius={999}
          style={{ position: 'absolute', bottom: 12, right: 12 }}
        >
          <View style={{
            width: 44, height: 44, borderRadius: 999,
            backgroundColor: colors.primary,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="add" size={24} color="#fff" />
          </View>
        </Pulsing>
      </View>
    );
  }

  if (kind === 'configure') {
    const cardStyle = {
      backgroundColor: colors.surface, borderRadius: 12, padding: 10, marginBottom: 6,
    };
    const labelStyle = {
      fontSize: 9, fontFamily: 'RobotoMono_500Medium' as const,
      color: colors.textSecondary,
      textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6,
    };
    return (
      <View>
        <View style={cardStyle}>
          <Text style={labelStyle}>Group Name</Text>
          <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 7 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Roboto_400Regular', color: colors.text }}>
              Saturday Crew
            </Text>
          </View>
        </View>
        <View style={cardStyle}>
          <Text style={labelStyle}>Call Frequency</Text>
          <View style={{ flexDirection: 'row', backgroundColor: colors.background, borderRadius: 8, padding: 2 }}>
            {['Daily', 'Weekly'].map((opt, i) => (
              <View key={opt} style={{
                flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center',
                backgroundColor: i === 0 ? colors.surface : 'transparent',
              }}>
                <Text style={{
                  fontSize: 11, fontFamily: 'Roboto_700Bold',
                  color: i === 0 ? colors.primary : colors.textSecondary,
                }}>{opt}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={cardStyle}>
          <Text style={labelStyle}>Call Duration</Text>
          <View style={{
            flexDirection: 'row', backgroundColor: colors.background, borderRadius: 8,
            padding: 7, alignItems: 'center', justifyContent: 'space-between',
          }}>
            <Text style={{ fontSize: 18, fontFamily: 'Roboto_400Regular', color: colors.textSecondary }}>−</Text>
            <Text style={{ fontSize: 13, fontFamily: 'RobotoMono_700Bold', color: colors.text }}>30 min</Text>
            <Text style={{ fontSize: 18, fontFamily: 'Roboto_400Regular', color: colors.primary }}>+</Text>
          </View>
        </View>
        <Pulsing onPress={onTap} borderRadius={999}>
          <View style={{
            backgroundColor: colors.primary, borderRadius: 999,
            paddingVertical: 11, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 13, fontFamily: 'Roboto_700Bold', color: '#fff' }}>Create Group</Text>
          </View>
        </Pulsing>
      </View>
    );
  }

  if (kind === 'home') {
    const cards = [
      { name: 'Saturday Crew',   cadence: 'Daily',  p: palettes[0], h: 70, tappable: true },
      { name: 'Mom + Dad',       cadence: 'Daily',  p: palettes[2], h: 56 },
      { name: 'College Friends', cadence: '3×/wk', p: palettes[1], h: 76 },
      { name: 'Book Club',       cadence: 'Weekly', p: palettes[3], h: 62 },
    ];
    const left  = [cards[0], cards[2]];
    const right = [cards[1], cards[3]];
    return (
      <View style={{ backgroundColor: colors.background, borderRadius: 14, overflow: 'hidden' }}>
        <FilterRow activeTab="All" />
        <View style={{ flexDirection: 'row', gap: 6, padding: 8 }}>
          <View style={{ flex: 1, gap: 6 }}>
            {left.map((c, i) => (
              <BentoCard key={i} name={c.name} cadence={c.cadence} palette={c.p} height={c.h} tappable={c.tappable} />
            ))}
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            {right.map((c, i) => (
              <BentoCard key={i} name={c.name} cadence={c.cadence} palette={c.p} height={c.h} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (kind === 'invite') {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' }}>
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          padding: 12,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        }}>
          <Text style={{ fontSize: 13, fontFamily: 'Roboto_700Bold', color: colors.text }}>
            Members{' '}
            <Text style={{ color: colors.textTertiary }}>3</Text>
          </Text>
          <Pulsing onPress={onTap} borderRadius={999}>
            <View style={{
              backgroundColor: colors.primaryLight, paddingHorizontal: 10,
              paddingVertical: 3, borderRadius: 999,
            }}>
              <Text style={{ fontSize: 11, fontFamily: 'Roboto_700Bold', color: colors.primary }}>
                + Invite
              </Text>
            </View>
          </Pulsing>
        </View>
        <MemberRow username="myles_h" isOwner isLast={false} />
        <MemberRow username="jordan" isLast={false} />
        <MemberRow username="ava_lee" isLast />
      </View>
    );
  }

  if (kind === 'invited') {
    const inv = palettes[3];
    return (
      <View>
        <View style={{ flexDirection: 'row', gap: 5, paddingBottom: 10 }}>
          <FilterPill label="All" />
          <FilterPill label="Daily" />
          <FilterPill label="Weekly" />
          <FilterPill label="Invited" badge="1" onPress={onTap} />
        </View>
        <View style={{
          backgroundColor: inv.bg + 'AA',
          borderWidth: 1.5, borderColor: inv.text + '55',
          borderRadius: 12, padding: 12,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            {['Weekly', 'Pending'].map(label => (
              <View key={label} style={{
                backgroundColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 8,
                paddingVertical: 2, borderRadius: 999,
              }}>
                <Text style={{ fontSize: 9, fontFamily: 'Roboto_700Bold', color: inv.text }}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 14, fontFamily: 'Roboto_700Bold', color: inv.text, marginBottom: 4 }}>
            Book Club
          </Text>
          <Text style={{ fontSize: 10, fontFamily: 'Roboto_400Regular', color: inv.text, opacity: 0.6, marginBottom: 10 }}>
            3 members
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{
              flex: 1, backgroundColor: inv.text, paddingVertical: 6,
              borderRadius: 999, alignItems: 'center',
            }}>
              <Text style={{ fontSize: 11, fontFamily: 'Roboto_700Bold', color: '#fff' }}>Accept</Text>
            </View>
            <View style={{
              paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
              borderWidth: 1, borderColor: inv.text + '44',
            }}>
              <Text style={{ fontSize: 11, fontFamily: 'Roboto_700Bold', color: inv.text }}>Decline</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (kind === 'random') {
    return (
      <Pulsing onPress={onTap} borderRadius={14} style={{ width: '100%' }}>
        <View style={{
          backgroundColor: 'rgba(20,20,42,0.96)', borderRadius: 14, padding: 12,
          flexDirection: 'row', alignItems: 'center', gap: 10,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        }}>
          <View style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="call" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Roboto_700Bold', color: colors.text, marginBottom: 2 }}>
              orbit
            </Text>
            <Text style={{ fontSize: 11, fontFamily: 'Roboto_400Regular', color: colors.textSecondary }}>
              Saturday Crew is calling — drop in?
            </Text>
          </View>
          <Text style={{ fontSize: 9, fontFamily: 'RobotoMono_500Medium', color: colors.textTertiary }}>
            now
          </Text>
        </View>
      </Pulsing>
    );
  }

  if (kind === 'spontaneous') {
    return (
      <View style={{ gap: 8 }}>
        <View style={{
          backgroundColor: colors.surface, borderRadius: 12, padding: 12,
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}>
          <View style={{
            width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 16, fontFamily: 'Roboto_700Bold', color: '#fff' }}>S</Text>
          </View>
          <View>
            <Text style={{ fontSize: 14, fontFamily: 'Roboto_700Bold', color: colors.text, marginBottom: 4 }}>
              Saturday Crew
            </Text>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {['Daily', '30 min'].map(label => (
                <View key={label} style={{
                  backgroundColor: colors.primaryLighter, paddingHorizontal: 7,
                  paddingVertical: 1, borderRadius: 999,
                }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Roboto_700Bold', color: colors.primary }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        <Pulsing onPress={onTap} borderRadius={12}>
          <View style={{
            backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Ionicons name="call" size={16} color="#fff" />
            <Text style={{ fontSize: 14, fontFamily: 'Roboto_700Bold', color: '#fff' }}>Start Call Now</Text>
          </View>
        </Pulsing>
      </View>
    );
  }

  if (kind === 'owner') {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' }}>
        <View style={{
          padding: 10, paddingHorizontal: 12,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        }}>
          <Text style={{
            fontSize: 11, fontFamily: 'RobotoMono_500Medium', color: colors.textTertiary,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            Members
          </Text>
        </View>
        <MemberRow username="myles_h" isOwner pulseBadge isLast={false} />
        <MemberRow username="jordan" isLast={false} />
        <MemberRow username="ava_lee" isLast />
      </View>
    );
  }

  return null;
}
