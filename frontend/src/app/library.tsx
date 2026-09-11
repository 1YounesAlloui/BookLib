import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BookDetailModal, Book, BookStatus } from '../components/BookDetailModal';
import { BookCard } from '../components/BookCard';
import { fetchUserLibrary, updateShelfStatus } from '../services/api';
import { useTheme, GOLD } from '../theme';

type TabType = 'TO_READ' | 'FINISHED' | 'FAVORITE';

const TABS = [
  {
    key: 'TO_READ' as const,
    label: 'To Read',
    icon: 'bookmark' as const,
    color: '#3b82f6',
    activeBg: 'rgba(59, 130, 246, 0.14)',
    activeBorder: '#3b82f6',
    emptyTitle: 'No books on your To-Read shelf',
    emptyMsg: 'Explore trending titles and add books you plan to read.',
  },
  {
    key: 'FINISHED' as const,
    label: 'Finished',
    icon: 'checkmark-circle' as const,
    color: '#10b981',
    activeBg: 'rgba(16, 185, 129, 0.14)',
    activeBorder: '#10b981',
    emptyTitle: 'No finished books yet',
    emptyMsg: 'Keep track of the books you have completed reading here.',
  },
  {
    key: 'FAVORITE' as const,
    label: 'Favorites',
    icon: 'heart' as const,
    color: '#ef4444',
    activeBg: 'rgba(239, 68, 68, 0.14)',
    activeBorder: '#ef4444',
    emptyTitle: 'No favorites saved',
    emptyMsg: 'Heart the books you cherish most to create your hall of fame.',
  },
] as const;

export default function LibraryScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  const [activeTab, setActiveTab] = useState<TabType>('TO_READ');
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    loadLibrary(false);
  }, []);

  const loadLibrary = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await fetchUserLibrary();
      setBooks(data);
    } catch (err: any) {
      setError(`Unable to load library (${err.message}).`);
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
    setBooks((prev) => {
      if (!newStatus) return prev.filter((b) => b.google_book_id !== bookId);
      return prev.map((b) =>
        b.google_book_id === bookId ? { ...(savedBook ?? b), status: newStatus } : b
      );
    });

    if (selectedBook?.google_book_id === bookId) {
      setSelectedBook((prev) =>
        prev ? { ...(savedBook ?? prev), status: newStatus } : null
      );
    }

    try {
      await updateShelfStatus(bookId, newStatus);
    } catch {
      loadLibrary(false);
    }
  };

  const filtered = books.filter((b) => b.status === activeTab);
  const countFor = (tab: TabType) =>
    books.filter((b) => b.status === tab).length;
  const activeConfig = TABS.find((t) => t.key === activeTab)!;

  const handleCardPress = useCallback((book: Book) => {
    setSelectedBook(book);
    setModalVisible(true);
  }, []);

  const renderCard = useCallback(
    ({ item }: { item: Book }) => (
      <BookCard item={item} onPress={handleCardPress} variant="grid4" />
    ),
    [handleCardPress]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Tab Switcher */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          const count = countFor(tab.key);
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                active
                  ? {
                      backgroundColor: tab.activeBg,
                      borderColor: tab.activeBorder,
                    }
                  : { borderColor: 'transparent' },
              ]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={active ? tab.icon : (`${tab.icon}-outline` as any)}
                size={14}
                color={active ? tab.color : theme.muted}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? tab.color : theme.muted },
                  active && { fontWeight: '700' },
                ]}
              >
                {tab.label}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    styles.tabBadge,
                    {
                      backgroundColor: active
                        ? `${tab.color}25`
                        : theme.pillBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      {
                        color: active ? tab.color : theme.muted,
                        fontWeight: active ? '700' : '600',
                      },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={[styles.stateText, { color: theme.muted }]}>
            Accessing your personal library…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={44} color="#ef4444" />
          <Text style={[styles.stateText, { color: theme.text, marginBottom: 16 }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: GOLD }]}
            onPress={() => loadLibrary(false)}
          >
            <Text style={[styles.retryBtnText, { color: theme.bg }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <View
            style={[
              styles.emptyIconBg,
              { backgroundColor: `${activeConfig.color}15` },
            ]}
          >
            <Ionicons
              name={`${activeConfig.icon}-outline` as any}
              size={48}
              color={activeConfig.color}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {activeConfig.emptyTitle}
          </Text>
          <Text style={[styles.stateText, { color: theme.muted }]}>
            {activeConfig.emptyMsg}
          </Text>
          <TouchableOpacity
            style={[styles.exploreBtn, { backgroundColor: GOLD }]}
            onPress={() => router.push('/explore')}
            activeOpacity={0.8}
          >
            <Ionicons name="compass-outline" size={16} color={theme.bg} />
            <Text style={[styles.exploreBtnText, { color: theme.bg }]}>
              Discover Books
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.google_book_id}
          renderItem={renderCard}
          numColumns={4}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadLibrary(true)}
              tintColor={GOLD}
              colors={[GOLD]}
            />
          }
        />
      )}

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
  container: { flex: 1, paddingTop: 14 },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  tabBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tabBadgeText: {
    fontSize: 10,
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 110,
  },
  stateText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    maxWidth: 280,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 4,
    textAlign: 'center',
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
  },
  exploreBtnText: { fontWeight: '700', fontSize: 14 },
  retryBtn: {
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 10,
  },
  retryBtnText: { fontWeight: '700', fontSize: 14 },

  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 110,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
});