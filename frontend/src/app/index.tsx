import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { BookDetailModal, Book, BookStatus } from '../components/BookDetailModal';
import { BookCard, formatAuthor, StatusBadge } from '../components/BookCard';
import { fetchHomeFeed, HomeFeed } from '../services/api';
import { useTheme, GOLD } from '../theme';

const CARD_WIDTH = 126;
const CARD_GAP = 12;

const CURATED_FALLBACK_HERO: Book = {
  google_book_id: 'hero_meditations',
  title: 'Meditations',
  authors: 'Marcus Aurelius',
  thumbnail:
    'https://books.google.com/books/content?id=9-8-AAAAIAAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
  description:
    'Timeless stoic wisdom from the Roman Emperor on ethics, duty, and human nature.',
  status: null,
};

const SectionHeader = memo(function SectionHeader({
  icon,
  iconColor,
  title,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  title: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View
        style={[
          styles.sectionIconBg,
          { backgroundColor: `${iconColor}18` },
        ]}
      >
        <Ionicons name={icon} size={15} color={iconColor} />
      </View>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    </View>
  );
});

function HeroCard({ book, onPress }: { book: Book; onPress: () => void }) {
  const { theme } = useTheme();
  const authorName = formatAuthor(book.authors);

  return (
    <TouchableOpacity
      style={[
        styles.hero,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
      activeOpacity={0.88}
      onPress={onPress}
    >
      {book.thumbnail ? (
        <Image
          source={{ uri: book.thumbnail }}
          style={styles.heroImage}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <View
          style={[
            styles.heroImage,
            styles.heroPlaceholder,
            { backgroundColor: theme.surfaceLight },
          ]}
        >
          <Ionicons name="book-outline" size={56} color={theme.subtle} />
        </View>
      )}
      <View style={styles.heroOverlay}>
        <View style={styles.heroPill}>
          <Ionicons name="sparkles" size={11} color={GOLD} />
          <Text style={styles.heroPillText}>Featured Book</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.heroAuthor} numberOfLines={1}>
          {authorName}
        </Text>
      </View>
      <StatusBadge status={book.status} />
    </TouchableOpacity>
  );
}

const BookHorizontalList = memo(function BookHorizontalList({
  data,
  onOpenBook,
}: {
  data: Book[];
  onOpenBook: (book: Book) => void;
}) {
  const renderItem = useCallback(
    ({ item }: { item: Book }) => (
      <BookCard item={item} onPress={onOpenBook} variant="horizontal" />
    ),
    [onOpenBook]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CARD_WIDTH + CARD_GAP,
      offset: (CARD_WIDTH + CARD_GAP) * index,
      index,
    }),
    []
  );

  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(item) => item.google_book_id}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      initialNumToRender={4}
      maxToRenderPerBatch={6}
      windowSize={3}
      nestedScrollEnabled={true}
      removeClippedSubviews={Platform.OS === 'android'}
    />
  );
});

export default function HomeScreen() {
  const { theme } = useTheme();
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    loadHomeFeed(false);
  }, []);

  const loadHomeFeed = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await fetchHomeFeed(isRefresh);
      setFeed(data);
    } catch {
      setError('Unable to load book feed. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleStatusChange = async (
    bookId: string,
    newStatus: BookStatus,
    savedBook?: Book
  ) => {
    if (!feed) return;
    const patch = (list: Book[]) =>
      (list || []).map((b) =>
        b.google_book_id === bookId ? { ...(savedBook ?? b), status: newStatus } : b
      );

    setFeed((prev) =>
      prev
        ? {
            ...prev,
            trending: patch(prev.trending),
            recommended: patch(prev.recommended),
            genres: Object.fromEntries(
              Object.entries(prev.genres).map(([k, v]) => [k, patch(v)])
            ),
          }
        : prev
    );
    if (selectedBook?.google_book_id === bookId) {
      setSelectedBook((prev) =>
        prev ? { ...(savedBook ?? prev), status: newStatus } : null
      );
    }
  };

  const openBook = useCallback((book: Book) => {
    setSelectedBook(book);
    setModalVisible(true);
  }, []);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={[styles.stateText, { color: theme.muted }]}>
          Curating your personal bookshelf…
        </Text>
      </View>
    );
  }

  if (error || !feed) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text style={[styles.stateText, { color: theme.text, marginBottom: 20 }]}>
          {error}
        </Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: GOLD }]}
          onPress={() => loadHomeFeed(false)}
        >
          <Text style={[styles.retryBtnText, { color: theme.bg }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hero =
    feed.trending.length > 0 ? feed.trending[0] : CURATED_FALLBACK_HERO;
  const restTrending =
    feed.trending.length > 0 ? feed.trending.slice(1) : [];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadHomeFeed(true)}
            tintColor={GOLD}
            colors={[GOLD]}
          />
        }
      >
        {/* Featured Hero */}
        <View style={styles.section}>
          <HeroCard book={hero} onPress={() => openBook(hero)} />
        </View>

        {/* Trending */}
        {restTrending.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              icon="flame"
              iconColor="#f97316"
              title="Trending Now"
            />
            <BookHorizontalList data={restTrending} onOpenBook={openBook} />
          </View>
        )}

        {/* Recommended */}
        {feed.recommended.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              icon="sparkles"
              iconColor={GOLD}
              title="Recommended Works"
            />
            <BookHorizontalList
              data={feed.recommended}
              onOpenBook={openBook}
            />
          </View>
        )}

        {/* Categorized Shelves */}
        {Object.entries(feed.genres).map(([genre, books]) =>
          !Array.isArray(books) || books.length === 0 ? null : (
            <View key={genre} style={styles.section}>
              <SectionHeader
                icon="book-outline"
                iconColor={GOLD}
                title={genre}
              />
              <BookHorizontalList data={books} onOpenBook={openBook} />
            </View>
          )
        )}
      </ScrollView>

      <BookDetailModal
        visible={modalVisible}
        book={selectedBook}
        onClose={() => setModalVisible(false)}
        onStatusChange={handleStatusChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingTop: 14,
    paddingBottom: 110,
  },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionIconBg: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  row: { paddingHorizontal: 16, gap: CARD_GAP },

  // Hero
  hero: {
    marginHorizontal: 16,
    height: 230,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 54,
    backgroundColor: 'rgba(13, 13, 16, 0.78)',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200, 169, 110, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(200, 169, 110, 0.4)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    marginBottom: 8,
  },
  heroPillText: { fontSize: 11, fontWeight: '600', color: GOLD },
  heroTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 25,
    marginBottom: 4,
  },
  heroAuthor: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '500',
  },

  // States
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  stateText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
  },
  retryBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: { fontWeight: '700', fontSize: 14 },
});