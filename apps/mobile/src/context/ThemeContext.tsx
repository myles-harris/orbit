import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, lightTheme, AppTheme } from '../theme';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  mode: 'dark',
  toggleTheme: () => {},
});

// Marigold retired the per-group hashed tile-colour system. A dead colour system
// sitting next to a live photo system is the kind of thing that gets resurrected
// by mistake, so its AsyncStorage keys are swept once here.
const STALE_GROUP_COLOR_PREFIX = 'group_color_v1_';

async function purgeStaleGroupColorKeys() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(k => k.startsWith(STALE_GROUP_COLOR_PREFIX));
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch {
    // Non-fatal — worst case a handful of dead keys linger until next launch.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemScheme === 'light' ? 'light' : 'dark');

  useEffect(() => { purgeStaleGroupColorKeys(); }, []);

  const toggleTheme = () => setMode(prev => (prev === 'dark' ? 'light' : 'dark'));
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
