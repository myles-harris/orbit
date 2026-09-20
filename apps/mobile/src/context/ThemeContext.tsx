import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, lightTheme, AppTheme } from '../theme';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  mode: 'dark',
  setMode: () => {},
  toggleTheme: () => {},
});

// The user's explicit choice. Absent until they make one, so a fresh install
// keeps following the system scheme.
const MODE_STORAGE_KEY = 'orbit.theme.mode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'dark' || value === 'light';
}

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
  // `null` until the stored choice has been read. Rendering nothing meanwhile is the
  // same gate App.tsx uses for fonts, and it is what stops a light-mode user seeing
  // one dark frame on every cold start.
  const [mode, setModeState] = useState<ThemeMode | null>(null);

  useEffect(() => { purgeStaleGroupColorKeys(); }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      let stored: string | null = null;
      try {
        stored = await AsyncStorage.getItem(MODE_STORAGE_KEY);
      } catch {
        // Unreadable storage falls through to the system scheme.
      }
      if (!active) return;
      setModeState(isThemeMode(stored) ? stored : systemScheme === 'light' ? 'light' : 'dark');
    })();
    return () => { active = false; };
    // Deliberately once, on mount: a later system-scheme change must not override a
    // choice the user has already made or been shown.
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_STORAGE_KEY, next).catch(() => {
      // The choice still applies for this session; it just won't survive a restart.
    });
  }, []);

  if (mode === null) return null;

  const toggleTheme = () => setMode(mode === 'dark' ? 'light' : 'dark');
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
