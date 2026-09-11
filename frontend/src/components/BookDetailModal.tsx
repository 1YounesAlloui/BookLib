import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { saveBookToShelf, updateShelfStatus } from '../services/api';
import { useTheme, GOLD } from '../theme';

export type BookStatus = 'TO_READ' | 'FINISHED' | 'FAVORITE' | null;

export interface Book {
  id?: number;
  google_book_id: string;
  title: string;
  authors?: string;
  description?: string;
  thumbnail?: string;
  categories?: string;
  status?: BookStatus;
  rating?: number;
  updated_at?: string;
  publishedDate?: string;
}

interface BookDetailModalProps {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onStatusChange: (
    googleBookId: string,
    newStatus: BookStatus,
    savedBook?: Book
  ) => Promise<void> | void;
}

const SHELF_BUTTONS = [
  {
    key: 'TO_READ' as const,
    label: 'To Read',
    icon: 'bookmark' as const,
    color: '#3b82f6',
    activeBg: 'rgba(59, 130, 246, 0.16)',
    activeBorder: '#3b82f6',
  },
  {
    key: 'FINISHED' as const,
    label: 'Finished',
    icon: 'checkmark-circle' as const,
    color: '#10b981',
    activeBg: 'rgba(16, 185, 129, 0.16)',
    activeBorder: '#10b981',
  },
  {
    key: 'FAVORITE' as const,
    label: 'Favorite',
    icon: 'heart' as const,
    color: '#ef4444',
    activeBg: 'rgba(239, 68, 68, 0.16)',
    activeBorder: '#ef4444',
  },
] as const;

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  visible,
  book,
  onClose,
  onStatusChange,
}) => {
  const { theme } = useTheme();
  const [currentStatus, setCurrentStatus] = useState<BookStatus>(null);
  const [loadingStatus, setLoadingStatus] = useState<BookStatus>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedBookId, setSavedBookId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (book) {
      setCurrentStatus(book.status ?? null);
      setSavedBookId(book.id);
      setErrorMsg(null);
    }
  }, [book]);

  if (!book) return null;

  const handlePressStatus = async (
    targetStatus: 'TO_READ' | 'FINISHED' | 'FAVORITE'
  ) => {
    const nextStatus: BookStatus =
      currentStatus === targetStatus ? null : targetStatus;
    const previousStatus = currentStatus;

    setCurrentStatus(nextStatus);
    setLoadingStatus(targetStatus);
    setErrorMsg(null);

    try {
      if (!savedBookId) {
        if (nextStatus === null) {
          await onStatusChange(book.google_book_id, null);
          return;
        }
        const saved = await saveBookToShelf(book, nextStatus);
        setSavedBookId(saved.id);
        await onStatusChange(book.google_book_id, nextStatus, saved);
      } else {
        await updateShelfStatus(book.google_book_id, nextStatus);
        await onStatusChange(book.google_book_id, nextStatus);
      }
    } catch (err: any) {
      setCurrentStatus(previousStatus);
      setErrorMsg(err.message || 'Failed to update shelf. Please try again.');
    } finally {
      setLoadingStatus(null);
    }
  };

  const formatAuthors = (authors?: string): string => {
    if (!authors || authors.trim().length === 0) return 'Unknown Author';
    return authors;
  };

  const categories = book.categories
    ? book.categories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View
        style={[styles.overlay, { backgroundColor: theme.modalBackdrop }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {/* Header drag handle + close */}
          <View style={styles.header}>
            <View
              style={[
                styles.headerIndicator,
                { backgroundColor: theme.border },
              ]}
            />
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeButton,
                { backgroundColor: theme.surfaceLight },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={theme.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            {/* Book Presentation */}
            <View style={styles.topSection}>
              <View style={styles.coverShadow}>
                {book.thumbnail ? (
                  <Image
                    source={{ uri: book.thumbnail }}
                    style={[
                      styles.coverImage,
                      { backgroundColor: theme.surfaceLight },
                    ]}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={[
                      styles.coverImage,
                      styles.placeholderCover,
                      { backgroundColor: theme.surfaceLight },
                    ]}
                  >
                    <Ionicons
                      name="book-outline"
                      size={48}
                      color={theme.subtle}
                    />
                  </View>
                )}
              </View>

              <Text style={[styles.title, { color: theme.text }]}>
                {book.title}
              </Text>
              <Text style={[styles.author, { color: GOLD }]}>
                {formatAuthors(book.authors)}
              </Text>

              {/* Category pills */}
              {categories.length > 0 && (
                <View style={styles.categoryRow}>
                  {categories.map((cat, i) => (
                    <View
                      key={i}
                      style={[
                        styles.categoryPill,
                        {
                          backgroundColor: theme.surfaceLight,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryPillText,
                          { color: theme.muted },
                        ]}
                      >
                        {cat}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Error */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#ef4444" />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* Shelf Actions */}
            <Text style={[styles.sectionHeading, { color: theme.muted }]}>
              Shelf Status
            </Text>
            <View style={styles.actionContainer}>
              {SHELF_BUTTONS.map(
                ({ key, label, icon, color, activeBg, activeBorder }) => {
                  const isActive = currentStatus === key;
                  const isLoading = loadingStatus === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.statusButton,
                        {
                          backgroundColor: isActive
                            ? activeBg
                            : theme.surfaceLight,
                          borderColor: isActive ? activeBorder : theme.border,
                        },
                      ]}
                      onPress={() => handlePressStatus(key)}
                      disabled={loadingStatus !== null}
                      activeOpacity={0.7}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={color} />
                      ) : (
                        <>
                          <Ionicons
                            name={
                              isActive ? icon : (`${icon}-outline` as any)
                            }
                            size={18}
                            color={isActive ? color : theme.muted}
                          />
                          <Text
                            style={[
                              styles.statusText,
                              { color: isActive ? color : theme.muted },
                              isActive && { fontWeight: '700' },
                            ]}
                          >
                            {label}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                }
              )}
            </View>

            {/* Description */}
            <View style={styles.descriptionSection}>
              <Text style={[styles.sectionHeading, { color: theme.muted }]}>
                About this book
              </Text>
              <Text
                style={[styles.descriptionText, { color: theme.textSecondary }]}
              >
                {book.description?.trim() ||
                  'No detailed synopsis available for this volume.'}
              </Text>
            </View>

            <View style={{ height: 28 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    maxHeight: '90%',
  },
  header: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerIndicator: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  closeButton: {
    position: 'absolute',
    right: 18,
    top: 10,
    padding: 6,
    borderRadius: 20,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  coverShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    marginBottom: 16,
  },
  coverImage: {
    width: 140,
    height: 204,
    borderRadius: 14,
  },
  placeholderCover: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 26,
  },
  author: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    width: '100%',
  },
  statusButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  descriptionSection: {
    width: '100%',
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
  },
});