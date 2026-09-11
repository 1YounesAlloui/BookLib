import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
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
  review?: string;
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

// ─── Half-Star Rating Component (0 to 5, step 0.5) ─────────────────────

function StarRating({
  rating,
  onChange,
  theme,
}: {
  rating: number;
  onChange: (newRating: number) => void;
  theme: any;
}) {
  const stars = [1, 2, 3, 4, 5];

  const handleHalfStarPress = (target: number) => {
    // If tapping the exact current value, reset to 0
    if (rating === target) {
      onChange(0);
    } else {
      onChange(target);
    }
  };

  const stepDown = () => {
    const next = Math.max(0, Math.round((rating - 0.5) * 2) / 2);
    onChange(next);
  };

  const stepUp = () => {
    const next = Math.min(5, Math.round((rating + 0.5) * 2) / 2);
    onChange(next);
  };

  return (
    <View style={ratingStyles.container}>
      {/* Stars + Score Pill */}
      <View style={ratingStyles.starsRow}>
        <View style={ratingStyles.starsPill}>
          {stars.map((starIndex) => {
            const isFull = rating >= starIndex;
            const isHalf = !isFull && rating >= starIndex - 0.5;
            const iconName = isFull
              ? 'star'
              : isHalf
              ? 'star-half'
              : 'star-outline';
            const iconColor = isFull || isHalf ? GOLD : theme.subtle;

            return (
              <View key={starIndex} style={ratingStyles.starWrapper}>
                {/* Visual Star */}
                <Ionicons name={iconName} size={30} color={iconColor} />

                {/* Left touch target: sets (starIndex - 0.5) */}
                <TouchableOpacity
                  style={ratingStyles.touchHalfLeft}
                  activeOpacity={0.5}
                  onPress={() => handleHalfStarPress(starIndex - 0.5)}
                  hitSlop={{ top: 8, bottom: 8, left: 2, right: 0 }}
                />

                {/* Right touch target: sets (starIndex) */}
                <TouchableOpacity
                  style={ratingStyles.touchHalfRight}
                  activeOpacity={0.5}
                  onPress={() => handleHalfStarPress(starIndex)}
                  hitSlop={{ top: 8, bottom: 8, left: 0, right: 2 }}
                />
              </View>
            );
          })}
        </View>

        {/* Score Display Badge */}
        <View
          style={[
            ratingStyles.scoreBadge,
            {
              backgroundColor: rating > 0 ? `${GOLD}18` : theme.surfaceLight,
              borderColor: rating > 0 ? `${GOLD}60` : theme.border,
            },
          ]}
        >
          <Text
            style={[
              ratingStyles.scoreText,
              { color: rating > 0 ? GOLD : theme.muted },
            ]}
          >
            {rating > 0 ? `${rating.toFixed(1)} ★` : '0.0 ★'}
          </Text>
        </View>
      </View>

      {/* Stepper + Clear row */}
      <View style={ratingStyles.controlsRow}>
        <TouchableOpacity
          style={[
            ratingStyles.stepBtn,
            { backgroundColor: theme.surfaceLight, borderColor: theme.border },
            rating <= 0 && { opacity: 0.35 },
          ]}
          onPress={stepDown}
          disabled={rating <= 0}
          activeOpacity={0.7}
        >
          <Ionicons name="remove" size={13} color={theme.text} />
          <Text style={[ratingStyles.stepBtnText, { color: theme.text }]}>
            -0.5
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            ratingStyles.stepBtn,
            { backgroundColor: theme.surfaceLight, borderColor: theme.border },
            rating >= 5 && { opacity: 0.35 },
          ]}
          onPress={stepUp}
          disabled={rating >= 5}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={13} color={theme.text} />
          <Text style={[ratingStyles.stepBtnText, { color: theme.text }]}>
            +0.5
          </Text>
        </TouchableOpacity>

        {rating > 0 && (
          <TouchableOpacity
            style={[
              ratingStyles.clearBtn,
              { backgroundColor: theme.surfaceLight, borderColor: theme.border },
            ]}
            onPress={() => onChange(0)}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle-outline" size={13} color={theme.muted} />
            <Text style={[ratingStyles.clearBtnText, { color: theme.muted }]}>
              Clear (0★)
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Main Modal Component ─────────────────────────────────────────────

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  visible,
  book,
  onClose,
  onStatusChange,
}) => {
  const { theme } = useTheme();
  const [currentStatus, setCurrentStatus] = useState<BookStatus>(null);
  const [currentRating, setCurrentRating] = useState<number>(0);
  const [currentReview, setCurrentReview] = useState<string>('');
  const [loadingStatus, setLoadingStatus] = useState<BookStatus>(null);
  const [savingReview, setSavingReview] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [savedBookId, setSavedBookId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (book) {
      setCurrentStatus(book.status ?? null);
      setCurrentRating(
        typeof book.rating === 'number' && !isNaN(book.rating)
          ? book.rating
          : 0
      );
      setCurrentReview(book.review ?? '');
      setSavedBookId(book.id);
      setErrorMsg(null);
      setSavedFeedback(null);
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
        const saved = await saveBookToShelf(
          book,
          nextStatus,
          currentRating,
          currentReview
        );
        setSavedBookId(saved.id);
        await onStatusChange(book.google_book_id, nextStatus, {
          ...book,
          ...saved,
          status: nextStatus,
          rating: currentRating,
          review: currentReview,
        });
      } else {
        await updateShelfStatus(
          book.google_book_id,
          nextStatus,
          currentRating,
          currentReview
        );
        await onStatusChange(book.google_book_id, nextStatus, {
          ...book,
          status: nextStatus,
          rating: currentRating,
          review: currentReview,
        });
      }
    } catch (err: any) {
      setCurrentStatus(previousStatus);
      setErrorMsg(err.message || 'Failed to update shelf. Please try again.');
    } finally {
      setLoadingStatus(null);
    }
  };

  const handleRatingChange = async (newRating: number) => {
    setCurrentRating(newRating);
    setErrorMsg(null);

    // If book is already saved on shelf, persist the rating immediately
    if (savedBookId && currentStatus) {
      try {
        await updateShelfStatus(
          book.google_book_id,
          currentStatus,
          newRating,
          currentReview
        );
        await onStatusChange(book.google_book_id, currentStatus, {
          ...book,
          status: currentStatus,
          rating: newRating,
          review: currentReview,
        });
        setSavedFeedback(newRating > 0 ? `Rated ${newRating}★` : 'Rating cleared');
        setTimeout(() => setSavedFeedback(null), 2200);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to update rating.');
      }
    }
  };

  const handleSaveReviewAndRating = async () => {
    setSavingReview(true);
    setErrorMsg(null);
    setSavedFeedback(null);

    const targetStatus = currentStatus ?? 'FINISHED';

    try {
      if (!savedBookId) {
        const saved = await saveBookToShelf(
          book,
          targetStatus,
          currentRating,
          currentReview
        );
        setSavedBookId(saved.id);
        setCurrentStatus(targetStatus);
        await onStatusChange(book.google_book_id, targetStatus, {
          ...book,
          ...saved,
          status: targetStatus,
          rating: currentRating,
          review: currentReview,
        });
      } else {
        const updated = await updateShelfStatus(
          book.google_book_id,
          targetStatus,
          currentRating,
          currentReview
        );
        await onStatusChange(book.google_book_id, targetStatus, {
          ...book,
          ...(typeof updated === 'object' ? updated : {}),
          status: targetStatus,
          rating: currentRating,
          review: currentReview,
        });
      }
      setSavedFeedback('Rating & review saved!');
      setTimeout(() => setSavedFeedback(null), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save review.');
    } finally {
      setSavingReview(false);
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

            {/* Error Message */}
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

            {/* ── Star Rating Section (0 to 5, step 0.5) ────────────────── */}
            <View style={styles.ratingSectionContainer}>
              <View style={styles.sectionHeadingRow}>
                <Text style={[styles.sectionHeading, { color: theme.muted, marginBottom: 0 }]}>
                  Rating (0 – 5 ★)
                </Text>
                <Text style={[styles.sectionHint, { color: theme.subtle }]}>
                  Tap half / full star
                </Text>
              </View>

              <StarRating
                rating={currentRating}
                onChange={handleRatingChange}
                theme={theme}
              />
            </View>

            {/* ── Review & Personal Notes Section ─────────────────────── */}
            <View style={styles.reviewSectionContainer}>
              <View style={styles.sectionHeadingRow}>
                <Text style={[styles.sectionHeading, { color: theme.muted, marginBottom: 0 }]}>
                  My Review & Notes
                </Text>
                <Text style={[styles.sectionHint, { color: theme.subtle }]}>
                  {currentReview.length}/1000
                </Text>
              </View>

              <View
                style={[
                  styles.reviewInputBox,
                  {
                    backgroundColor: theme.surfaceLight,
                    borderColor: theme.border,
                  },
                ]}
              >
                <TextInput
                  style={[styles.reviewInput, { color: theme.text }]}
                  multiline
                  numberOfLines={4}
                  maxLength={1000}
                  placeholder="What did you think of this book? Write your review, quotes, or thoughts…"
                  placeholderTextColor={theme.muted}
                  value={currentReview}
                  onChangeText={setCurrentReview}
                  textAlignVertical="top"
                />
              </View>

              {/* Review Actions */}
              <View style={styles.reviewActionsRow}>
                {savedFeedback ? (
                  <View style={styles.feedbackRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={15}
                      color="#10b981"
                    />
                    <Text style={styles.feedbackText}>{savedFeedback}</Text>
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
                )}

                <TouchableOpacity
                  style={[
                    styles.saveReviewBtn,
                    {
                      backgroundColor: GOLD,
                      opacity: savingReview ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleSaveReviewAndRating}
                  disabled={savingReview}
                  activeOpacity={0.8}
                >
                  {savingReview ? (
                    <ActivityIndicator size="small" color="#0d0d10" />
                  ) : (
                    <>
                      <Ionicons
                        name="cloud-upload-outline"
                        size={15}
                        color="#0d0d10"
                      />
                      <Text style={styles.saveReviewBtnText}>
                        Save Review & Rating
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
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

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Rating Styles ────────────────────────────────────────────────────

const ratingStyles = StyleSheet.create({
  container: {
    paddingTop: 4,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  starsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starWrapper: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  touchHalfLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    zIndex: 2,
  },
  touchHalfRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    zIndex: 2,
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  stepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  stepBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

// ─── Modal Styles ─────────────────────────────────────────────────────

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
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 11,
    fontWeight: '500',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
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

  // Rating Container
  ratingSectionContainer: {
    marginBottom: 20,
  },

  // Review Container
  reviewSectionContainer: {
    marginBottom: 22,
  },
  reviewInputBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 88,
  },
  reviewInput: {
    fontSize: 13.5,
    lineHeight: 20,
    minHeight: 72,
  },
  reviewActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  saveReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  saveReviewBtnText: {
    color: '#0d0d10',
    fontSize: 12.5,
    fontWeight: '700',
  },

  descriptionSection: {
    width: '100%',
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
  },
});