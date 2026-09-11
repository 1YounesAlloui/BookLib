import React from 'react';
import { View, TouchableOpacity, Platform, ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme, GOLD } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Tab Icon with active indicator ─────────────────────────────────
function TabIcon({
  name,
  focused,
  color,
}: {
  name: IconName;
  focused: boolean;
  color: ColorValue;
}) {
  const goldAlpha = 'rgba(200, 169, 110, 0.15)';
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 40,
        borderRadius: 20,
        backgroundColor: focused ? goldAlpha : 'transparent',
        transform: [{ scale: focused ? 1.05 : 1 }],
      }}
    >
      <Ionicons name={name} size={22} color={color} />
      <View
        style={{
          position: 'absolute',
          bottom: 2,
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: focused ? GOLD : 'transparent',
          shadowColor: GOLD,
          shadowOpacity: focused ? 0.8 : 0,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
          elevation: focused ? 3 : 0,
        }}
      />
    </View>
  );
}

// ─── Theme Toggle Button ─────────────────────────────────────────────
function ThemeToggle() {
  const { isDark, toggleTheme, theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={toggleTheme}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{
        marginRight: 14,
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: theme.surfaceLight,
        borderWidth: 1,
        borderColor: theme.border,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      activeOpacity={0.75}
    >
      <Ionicons
        name={isDark ? 'sunny-outline' : 'moon-outline'}
        size={17}
        color={GOLD}
      />
    </TouchableOpacity>
  );
}

// ─── Inner Layout (needs theme access) ──────────────────────────────
function InnerTabLayout() {
  const { theme, isDark } = useTheme();

  const MUTED = theme.muted;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: GOLD,
          tabBarInactiveTintColor: MUTED,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,

          tabBarStyle: {
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: Platform.OS === 'ios' ? 24 : 16,
            height: 64,
            borderRadius: 24,
            backgroundColor: theme.tabBg,
            borderTopWidth: 0,
            borderWidth: 1,
            borderColor: theme.tabBorder,
            paddingHorizontal: 12,
            paddingTop: 6,
            paddingBottom: Platform.OS === 'ios' ? 8 : 6,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.3 : 0.12,
            shadowRadius: 16,
            elevation: 10,
          },

          tabBarItemStyle: {
            borderRadius: 18,
            marginHorizontal: 4,
          },

          headerStyle: {
            backgroundColor: theme.headerBg,
          },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 18,
            color: theme.headerText,
            letterSpacing: 0.4,
          },
          headerTintColor: GOLD,
          headerRight: () => <ThemeToggle />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            headerTitle: 'Discover',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon
                name={focused ? 'compass' : 'compass-outline'}
                focused={focused}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="explore"
          options={{
            title: 'Search',
            headerTitle: 'Search',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon
                name={focused ? 'search' : 'search-outline'}
                focused={focused}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="library"
          options={{
            title: 'My Shelf',
            headerTitle: 'My Shelf',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon
                name={focused ? 'library' : 'library-outline'}
                focused={focused}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

// ─── Root Layout (wraps with ThemeProvider) ──────────────────────────
export default function TabLayout() {
  return (
    <ThemeProvider>
      <InnerTabLayout />
    </ThemeProvider>
  );
}