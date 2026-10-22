import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import * as SecureStore from '@/src/native/platform';
import { StatusBar } from 'react-native';
import { darkTheme, lightTheme, type AppTheme, type ThemeMode } from '@/constants/Theme';

const THEME_KEY = 'ferrepos.theme-mode';
type ThemeContextValue = { mode: ThemeMode; theme: AppTheme; setMode: (mode: ThemeMode) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

async function readThemeMode() { return SecureStore.getItemAsync(THEME_KEY); }
async function saveThemeMode(mode: ThemeMode) { await SecureStore.setItemAsync(THEME_KEY, mode); }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void readThemeMode().then((stored) => {
      if (active && (stored === 'system' || stored === 'light' || stored === 'dark')) setModeState(stored);
    }).catch(() => undefined).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    void saveThemeMode(nextMode).catch(() => undefined);
  }, []);
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const theme = isDark ? darkTheme : lightTheme;
  const value = useMemo(() => ({ mode, theme, setMode }), [mode, theme, setMode]);

  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: lightTheme.colors.background }}><ActivityIndicator color={lightTheme.colors.primary} /></View>;

  return <ThemeContext.Provider value={value}>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    {children}
  </ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme debe usarse dentro de ThemeProvider');
  return value;
}
