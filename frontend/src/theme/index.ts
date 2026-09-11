import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Design Tokens ───────────────────────────────────────────────────

export const GOLD = '#c8a96e';
export const GOLD_LIGHT = 'rgba(200, 169, 110, 0.15)';

export interface ThemeColors {
  // Backgrounds
  bg: string;
  surface: string;
  surfaceLight: string;
  surfaceElevated: string;
  surfaceHover: string;

  // Text
  text: string;
  textSecondary: string;
  muted: string;
  subtle: string;

  // Borders
  border: string;
  borderLight: string;

  // Tab bar
  tabBg: string;
  tabBorder: string;

  // Header
  headerBg: string;
  headerText: string;

  // Pill / chip
  pillBg: string;

  // Modal backdrop
  modalBackdrop: string;

  // Search
  searchBg: string;

  // Status bar style
  statusBarStyle: 'light-content' | 'dark-content';

  // Icon helper
  isDark: boolean;
}

export const DARK_THEME: ThemeColors = {
  bg: '#0d0d10',
  surface: '#121216',
  surfaceLight: '#1a1a22',
  surfaceElevated: '#1e1e28',
  surfaceHover: '#24242e',
  text: '#f0ede8',
  textSecondary: '#d4cfc8',
  muted: '#8e8e9f',
  subtle: '#4a4a5a',
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.15)',
  tabBg: 'rgba(17, 17, 20, 0.94)',
  tabBorder: 'rgba(255, 255, 255, 0.09)',
  headerBg: '#0d0d10',
  headerText: '#f0ede8',
  pillBg: 'rgba(255, 255, 255, 0.05)',
  modalBackdrop: 'rgba(0, 0, 0, 0.78)',
  searchBg: '#121216',
  statusBarStyle: 'light-content',
  isDark: true,
};

export const LIGHT_THEME: ThemeColors = {
  bg: '#f5f4f0',
  surface: '#ffffff',
  surfaceLight: '#f0eeea',
  surfaceElevated: '#faf9f7',
  surfaceHover: '#e8e6e0',
  text: '#1a1814',
  textSecondary: '#3d3a33',
  muted: '#6e6a5f',
  subtle: '#b0ab9f',
  border: 'rgba(0, 0, 0, 0.09)',
  borderLight: 'rgba(0, 0, 0, 0.18)',
  tabBg: 'rgba(255, 255, 255, 0.95)',
  tabBorder: 'rgba(0, 0, 0, 0.10)',
  headerBg: '#f5f4f0',
  headerText: '#1a1814',
  pillBg: 'rgba(0, 0, 0, 0.04)',
  modalBackdrop: 'rgba(0, 0, 0, 0.45)',
  searchBg: '#ffffff',
  statusBarStyle: 'dark-content',
  isDark: false,
};

// ─── Theme Context ────────────────────────────────────────────────────

interface ThemeContextValue {
  theme: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DARK_THEME,
  isDark: true,
  toggleTheme: () => {},
});

const STORAGE_KEY = '@book_rating_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemScheme !== 'light');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'dark') setIsDark(true);
        else if (stored === 'light') setIsDark(false);
        else setIsDark(systemScheme !== 'light');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    AsyncStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light').catch(() => {});
  };

  if (!loaded) return null;

  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  return React.createElement(
    ThemeContext.Provider,
    { value: { theme, isDark, toggleTheme } },
    children
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export default ThemeContext;
