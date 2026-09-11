import React, { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Book, BookStatus } from './BookDetailModal';
import { useTheme, GOLD } from '../theme';

// ─── Static Exports for backward-compat ─────────────────────────────
// (used as fallback if accessed outside ThemeProvider — resolved at runtime via hook in components)
export { GOLD };
export const BG = '#0d0d10';
export const SURFACE = '#121216';
export const SURFACE_LIGHT = '#1a1a22';
export const BORDER = 'rgba(255, 255, 255, 0.08)';
export const TEXT = '#f0ede8';
export const MUTED = '#8e8e9f';

export const STATUS_CONFIG: Record<
  string,
  { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string }
> = {
  TO_READ: { icon: 'bookmark', color: '#3b82f6', label: 'To Read' },
  FINISHED: { icon: 'checkmark-circle', color: '#10b981', label: 'Finished' },
  FAVORITE: { icon: 'heart', color: '#ef4444', label: 'Favorite' },
};

export function StatusBadge({
  status,
  size = 'default',
}: {
  status?: BookStatus;
  size?: 'default' | 'small';
}) {
  if (!status || !STATUS_CONFIG[status]) return null;
  const { icon, color } = STATUS_CONFIG[status];
  const isSmall = size === 'small';

  return (
    <View
      style={[
        {
          position: 'absolute',
          top: isSmall ? 4 : 6,
          right: isSmall ? 4 : 6,
          width: isSmall ? 16 : 20,
          height: isSmall ? 16 : 20,
          borderRadius: isSmall ? 8 : 10,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: color,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.4,
          shadowRadius: 3,
          elevation: 3,
        },
      ]}
    >
      <Ionicons name={icon} size={isSmall ? 8 : 10} color="#fff" />
    </View>
  );
}

export function formatAuthor(authors?: string[] | string): string {
  if (Array.isArray(authors) && authors.length > 0) return authors[0];
  if (typeof authors === 'string' && authors.trim()) {
    return authors.split(',')[0].trim();
  }
  return 'Unknown';
}

interface BookCardProps {
  item: Book;
  onPress: (book: Book) => void;
  width?: number | `${number}%`;
  variant?: 'grid' | 'grid4' | 'horizontal';
  style?: ViewStyle;
}

export const BookCard = memo(function BookCard({
  item,
  onPress,
  width,
  variant = 'horizontal',
  style,
}: BookCardProps) {
  const { theme } = useTheme();
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  const authorName = formatAuthor(item.authors);
  const isGrid4 = variant === 'grid4';
  const isGrid = variant === 'grid';

  return (
    <TouchableOpacity
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: isGrid4 ? 10 : 12,
          borderWidth: 1,
          borderColor: theme.border,
          overflow: 'hidden',
        },
        isGrid4
          ? { width: '23%', marginBottom: 12 }
          : isGrid
          ? { width: '48%', marginBottom: 14 }
          : { width: 126 },
        width ? { width: width as any } : undefined,
        style,
      ]}
      activeOpacity={0.82}
      onPress={handlePress}
    >
      <View
        style={[
          {
            position: 'relative',
            width: '100%',
            backgroundColor: theme.surfaceLight,
            overflow: 'hidden',
          },
          isGrid4
            ? { height: 110 }
            : isGrid
            ? { height: 196 }
            : { height: 172 },
        ]}
      >
        {item.thumbnail ? (
          <Image
            source={{ uri: item.thumbnail }}
            style={styles.coverImage}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.coverImage, styles.placeholderCover]}>
            <Ionicons
              name="book-outline"
              size={isGrid4 ? 18 : 28}
              color={theme.subtle}
            />
          </View>
        )}
        <StatusBadge status={item.status} size={isGrid4 ? 'small' : 'default'} />
        {typeof item.rating === 'number' && item.rating > 0 ? (
          <View
            style={[
              styles.ratingBadge,
              isGrid4 && styles.ratingBadgeSmall,
            ]}
          >
            <Ionicons name="star" size={isGrid4 ? 8 : 10} color={GOLD} />
            <Text
              style={[
                styles.ratingText,
                isGrid4 && { fontSize: 8.5 },
              ]}
            >
              {Number(item.rating).toFixed(1)}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          { padding: 8 },
          isGrid4 && { padding: 5, paddingTop: 5, paddingBottom: 6 },
        ]}
      >
        <Text
          style={[
            {
              fontSize: 13,
              fontWeight: '600',
              color: theme.text,
              marginBottom: 3,
              lineHeight: 17,
            },
            isGrid4 && {
              fontSize: 10,
              fontWeight: '600',
              lineHeight: 13,
              marginBottom: 2,
            },
          ]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <Text
          style={[
            { fontSize: 11, color: theme.muted, fontWeight: '500' },
            isGrid4 && { fontSize: 9, lineHeight: 12 },
          ]}
          numberOfLines={1}
        >
          {authorName}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  coverImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCover: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(13, 13, 16, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(200, 169, 110, 0.35)',
  },
  ratingBadgeSmall: {
    top: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD,
  },
});
