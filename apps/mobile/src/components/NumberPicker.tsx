import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { spacing, radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;

interface NumberPickerProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}

export default function NumberPicker({ min, max, value, onChange, suffix }: NumberPickerProps) {
  const { theme: { colors } } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const items = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    const index = Math.max(0, value - min);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (e: any) => {
      const rawIndex = e.nativeEvent.contentOffset.y / ITEM_HEIGHT;
      const index = Math.round(rawIndex);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      onChange(items[clamped]);
    },
    [items, onChange]
  );

  const handleScrollEndDrag = useCallback(
    (e: any) => {
      const rawIndex = e.nativeEvent.contentOffset.y / ITEM_HEIGHT;
      const index = Math.round(rawIndex);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      onChange(items[clamped]);
    },
    [items, onChange]
  );

  return (
    <View style={styles.container}>
      <View style={styles.fadeTop} pointerEvents="none" />
      <View style={styles.selectionHighlight} pointerEvents="none" />
      <View style={styles.fadeBottom} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollEndDrag={handleScrollEndDrag}
        contentContainerStyle={styles.contentContainer}
      >
        {items.map((item) => {
          const isSelected = item === value;
          return (
            <View key={item} style={styles.item}>
              <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                {suffix ? `${item} ${suffix}` : item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
    container: {
      height: ITEM_HEIGHT * VISIBLE_ITEMS,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: colors.background,
      borderRadius: radius.md,
    },
    scroll: { flex: 1 },
    contentContainer: { paddingVertical: ITEM_HEIGHT },
    item: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
    itemText: { fontSize: 17, color: colors.textTertiary, fontWeight: '400' },
    itemTextSelected: { color: colors.text, fontWeight: '600', fontSize: 18 },
    selectionHighlight: {
      position: 'absolute',
      top: ITEM_HEIGHT, left: 0, right: 0, height: ITEM_HEIGHT,
      backgroundColor: colors.primary + '18',
      borderTopWidth: 1, borderBottomWidth: 1,
      borderColor: colors.primary + '40',
      zIndex: 1,
    },
    fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_HEIGHT, zIndex: 2 },
    fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_HEIGHT, zIndex: 2 },
  });
}
