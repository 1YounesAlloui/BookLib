import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BookDetailModal, Book, BookStatus } from '../components/BookDetailModal';
import { BookCard, GOLD, BG, SURFACE, SURFACE_LIGHT, BORDER, TEXT, MUTED } from '../components/BookCard';
import { searchBooks } from '../services/api';

const CATEGORIES = [
  'All',
  'Politics',
  'Geopolitics',
  'Geography',
  'Fiction',
  'Technology',
  'Philosophy',
  'Science',
  'History',
  'Psychology',
  'Business',
  'Biography',
  'Mystery',
  'Fantasy',
  'Self Help',
];

const WRITING_STYLES = [
  'All',
  'Literary',
  'Analytical',
  'Dark',
  'Lighthearted',
  'Academic',
  'Poetic',
  'Thriller',
  'Philosophical',
];

const NOVEL_TYPES = [
  'All',
  'Novel',
  'Series',
  'Short Stories',
  'Graphic Novel',
  'Non-Fiction',
  'Essay / Treatise',
  'Biography / Memoir',
];

export type SearchScope = 'all' | 'title' | 'author';
export type SortOption = 'relevance' | 'newest' | 'title';

export interface FilterOptions {
  sortBy: SortOption;
  genre: string;
  writingStyle: string;
  novelType: string;
}

const DEFAULT_FILTERS: FilterOptions = {
  sortBy: 'relevance',
  genre: 'All',
  writingStyle: 'All',
  novelType: 'All',
};

// ─── Taxonomy Keyword Mappings for Accurate Filtering ───────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  All: [],
  Politics: ['politic', 'government', 'statecraft', 'diplomacy', 'democracy', 'geopolitics', 'policy', 'civics', 'international relations', 'political science', 'law'],
  Geopolitics: ['geopolitic', 'international relations', 'foreign policy', 'world politics', 'global affairs', 'diplomacy', 'strategy', 'statecraft', 'cold war'],
  Geography: ['geograph', 'earth', 'atlas', 'maps', 'exploration', 'cartography', 'travel', 'spatial'],
  Fiction: ['fiction', 'novel', 'literature', 'story', 'stories', 'prose', 'tales'],
  Technology: ['technol', 'computer', 'software', 'programming', 'ai', 'artificial intelligence', 'code', 'data', 'algorithm', 'cyber', 'digital', 'tech', 'internet'],
  Philosophy: ['philosoph', 'ethics', 'logic', 'stoic', 'epistemology', 'metaphysics', 'existential', 'morality', 'thought', 'meditation'],
  Science: ['science', 'physics', 'biology', 'chemistry', 'astronomy', 'cosmos', 'evolution', 'quantum', 'nature', 'scientific', 'space'],
  History: ['history', 'historical', 'war', 'ancient', 'civilization', 'empire', 'revolution', 'medieval', 'century', 'chronicle'],
  Psychology: ['psycholog', 'behavior', 'mind', 'cognitive', 'mental', 'brain', 'psychoanalysis', 'therapy', 'neuro', 'emotion'],
  Business: ['business', 'econom', 'finance', 'invest', 'management', 'market', 'money', 'leadership', 'startup', 'entrepreneur', 'wealth'],
  Biography: ['biograph', 'autobiograph', 'memoir', 'diary', 'life of', 'profile'],
  Mystery: ['mystery', 'thriller', 'detective', 'crime', 'suspense', 'investigation', 'murder', 'noir'],
  Fantasy: ['fantasy', 'magic', 'wizard', 'dragon', 'myth', 'legend', 'epic fantasy', 'supernatural', 'lore'],
  'Self Help': ['self-help', 'self help', 'personal development', 'motivation', 'habits', 'productivity', 'success', 'mindset', 'inspiration'],
};

const NOVEL_TYPE_KEYWORDS: Record<string, string[]> = {
  All: [],
  Novel: ['novel', 'fiction', 'literature', 'story'],
  Series: ['series', 'volume', 'trilogy', 'chronicles', 'book 1', 'book 2', 'book 3', 'part 1', 'saga'],
  'Short Stories': ['short stor', 'stories', 'collection', 'anthology', 'tales'],
  'Graphic Novel': ['graphic novel', 'comic', 'manga', 'illustrated'],
  'Non-Fiction': ['non-fiction', 'nonfiction', 'biography', 'history', 'science', 'business', 'philosophy', 'politics', 'self-help'],
  'Essay / Treatise': ['essay', 'treatise', 'papers', 'commentary', 'dialogues', 'lectures'],
  'Biography / Memoir': ['biograph', 'memoir', 'autobiograph', 'life of'],
};

const WRITING_STYLE_KEYWORDS: Record<string, string[]> = {
  All: [],
  Literary: ['literary', 'classic', 'masterpiece', 'prize', 'fiction', 'prose'],
  Analytical: ['analysis', 'analytical', 'research', 'critical', 'study', 'science', 'theory', 'data'],
  Dark: ['dark', 'gothic', 'horror', 'grim', 'noir', 'tragic', 'dystopian'],
  Lighthearted: ['humor', 'comedy', 'funny', 'witty', 'warm', 'lighthearted', 'fun', 'charming'],
  Academic: ['academic', 'university', 'textbook', 'journal', 'scholarly', 'treatise', 'study'],
  Poetic: ['poet', 'verse', 'lyric', 'rhyme', 'stanza'],
  Thriller: ['thriller', 'suspense', 'mystery', 'detective', 'action', 'crime', 'tension'],
  Philosophical: ['philosoph', 'stoic', 'ethics', 'wisdom', 'existential', 'meditation'],
};

export default function ExploreScreen() {
  // Input vs Active Search Query
  const [inputText, setInputText] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [focused, setFocused] = useState(false);

  // Results & Pagination
  const [books, setBooks] = useState<Book[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Filters State
  const [activeFilters, setActiveFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [tempFilters, setTempFilters] = useState<FilterOptions>(DEFAULT_FILTERS);

  // Refs for debouncing & network cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if non-default filters or non-empty query are active
  const isFilterActive = useMemo(() => {
    return (
      activeFilters.sortBy !== DEFAULT_FILTERS.sortBy ||
      activeFilters.genre !== DEFAULT_FILTERS.genre ||
      activeFilters.writingStyle !== DEFAULT_FILTERS.writingStyle ||
      activeFilters.novelType !== DEFAULT_FILTERS.novelType
    );
  }, [activeFilters]);

  // Centralized fetch function
  const performFetch = useCallback(
    async (
      q: string,
      scope: SearchScope,
      genre: string,
      pageNum: number,
      isLoadMore = false
    ) => {
      // Abort previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (isLoadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
          setError(null);
        }

        const trimmedQ = q.trim();
        const data = await searchBooks({
          q: trimmedQ || undefined,
          scope: trimmedQ ? scope : undefined,
          genre: genre !== 'All' ? genre : undefined,
          page: pageNum,
          limit: 24,
          signal: controller.signal,
        });

        setBooks((prev) => {
          if (pageNum === 1) return data.results;
          const seen = new Set(prev.map((b) => b.google_book_id));
          const uniqueNew = data.results.filter((b) => !seen.has(b.google_book_id));
          return [...prev, ...uniqueNew];
        });

        setPage(pageNum);
        setHasMore(data.has_more);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (!isLoadMore) {
          setError(err.message || 'Unable to fetch books. Please check connection.');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Trigger search execution immediately (canceling any pending debounce)
  const executeSearch = useCallback(
    (textToSearch: string, scope = searchScope, genre = activeFilters.genre) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setActiveQuery(textToSearch);
      performFetch(textToSearch, scope, genre, 1, false);
    },
    [searchScope, activeFilters.genre, performFetch]
  );

  // Debounced search when user types in search box (600ms debounce)
  const handleInputChange = (text: string) => {
    setInputText(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Wait until user finishes typing before executing search
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(text, searchScope, activeFilters.genre);
    }, 600);
  };

  // Immediate execution on keyboard Enter / Search
  const handleSubmitSearch = () => {
    executeSearch(inputText, searchScope, activeFilters.genre);
  };

  // Clear search input and instantly reset search results
  const handleClearSearch = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setInputText('');
    setActiveQuery('');
    performFetch('', searchScope, activeFilters.genre, 1, false);
  };

  // Change Search Scope ('all' | 'title' | 'author')
  const handleScopeChange = (newScope: SearchScope) => {
    setSearchScope(newScope);
    executeSearch(inputText, newScope, activeFilters.genre);
  };

  // Category Pill Selection
  const handleSelectCategory = (cat: string) => {
    setActiveFilters((prev) => ({ ...prev, genre: cat }));
    executeSearch(inputText, searchScope, cat);
  };

  // Initial load
  useEffect(() => {
    performFetch(activeQuery, searchScope, activeFilters.genre, 1, false);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Load more on scroll reached end
  const handleLoadMore = () => {
    if (!loading && !loadingMore && hasMore) {
      performFetch(activeQuery, searchScope, activeFilters.genre, page + 1, true);
    }
  };

  // Filter and Sort Books
  const filteredAndSortedBooks = useMemo(() => {
    let list = [...books];

    // Helper: case-insensitive partial match for search query
    const matchTokens = (target: string, query: string): boolean => {
      const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return true;
      const lowerTarget = target.toLowerCase();
      return tokens.every((tok) => lowerTarget.includes(tok));
    };

    // 1. Apply Active Query & Scope matching
    if (activeQuery.trim()) {
      const q = activeQuery.trim();
      list = list.filter((b) => {
        const title = b.title || '';
        const authors = b.authors || '';
        const desc = b.description || '';
        const cats = b.categories || '';

        if (searchScope === 'title') {
          return matchTokens(title, q);
        }
        if (searchScope === 'author') {
          return matchTokens(authors, q);
        }
        // Scope === 'all': match in title OR author OR categories OR description
        return (
          matchTokens(title, q) ||
          matchTokens(authors, q) ||
          matchTokens(cats, q) ||
          matchTokens(desc, q)
        );
      });
    }

    // 2. Genre / Category Filter (using rich taxonomy keyword matching)
    if (activeFilters.genre !== 'All') {
      const keywords = CATEGORY_KEYWORDS[activeFilters.genre] || [activeFilters.genre.toLowerCase()];
      list = list.filter((b) => {
        const searchable = `${b.categories || ''} ${b.title || ''} ${b.description || ''}`.toLowerCase();
        return keywords.some((kw) => searchable.includes(kw));
      });
    }

    // 3. Novel / Book Format Filter
    if (activeFilters.novelType !== 'All') {
      const keywords = NOVEL_TYPE_KEYWORDS[activeFilters.novelType] || [activeFilters.novelType.toLowerCase()];
      list = list.filter((b) => {
        const searchable = `${b.title || ''} ${b.description || ''} ${b.categories || ''}`.toLowerCase();
        return keywords.some((kw) => searchable.includes(kw));
      });
    }

    // 4. Writing Style & Tone Filter
    if (activeFilters.writingStyle !== 'All') {
      const keywords = WRITING_STYLE_KEYWORDS[activeFilters.writingStyle] || [activeFilters.writingStyle.toLowerCase()];
      list = list.filter((b) => {
        const searchable = `${b.title || ''} ${b.description || ''} ${b.categories || ''}`.toLowerCase();
        return keywords.some((kw) => searchable.includes(kw));
      });
    }

    // 5. Sort Results
    if (activeFilters.sortBy === 'newest') {
      list.sort((a, b) => {
        const yearA = parseInt(a.publishedDate || '0', 10) || 0;
        const yearB = parseInt(b.publishedDate || '0', 10) || 0;
        return yearB - yearA;
      });
    } else if (activeFilters.sortBy === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (activeFilters.sortBy === 'relevance' && activeQuery.trim()) {
      // Prioritize title/author matches when sorting by relevance
      const qLower = activeQuery.trim().toLowerCase();
      list.sort((a, b) => {
        const aTitleMatch = (a.title || '').toLowerCase().includes(qLower);
        const bTitleMatch = (b.title || '').toLowerCase().includes(qLower);
        if (aTitleMatch && !bTitleMatch) return -1;
        if (!aTitleMatch && bTitleMatch) return 1;
        return 0;
      });
    }

    return list;
  }, [books, activeQuery, searchScope, activeFilters]);

  // Book Status and Shelf Management
  const handleStatusChange = async (
    bookId: string,
    newStatus: BookStatus,
    savedBook?: Book
  ) => {
    setBooks((prev) =>
      prev.map((b) =>
        b.google_book_id === bookId
          ? { ...b, ...(savedBook ?? {}), status: newStatus }
          : b
      )
    );
    if (selectedBook?.google_book_id === bookId) {
      setSelectedBook((prev) =>
        prev ? { ...prev, ...(savedBook ?? {}), status: newStatus } : null
      );
    }
  };

  // Filter Modal Controls
  const openFilterModal = () => {
    setTempFilters({ ...activeFilters });
    setFilterModalVisible(true);
  };

  const applyFilters = () => {
    const genreChanged = tempFilters.genre !== activeFilters.genre;
    setActiveFilters(tempFilters);
    setFilterModalVisible(false);
    if (genreChanged) {
      executeSearch(inputText, searchScope, tempFilters.genre);
    }
  };

  const resetFilters = () => {
    const defaultFilters = DEFAULT_FILTERS;
    setTempFilters(defaultFilters);
    setActiveFilters(defaultFilters);
    setFilterModalVisible(false);
    executeSearch(inputText, searchScope, 'All');
  };

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
    <View style={styles.container}>
      {/* Search Header Row */}
      <View style={styles.searchHeaderRow}>
        <View style={[styles.searchBar, focused && styles.searchBarFocused]}>
          <Ionicons
            name="search-outline"
            size={18}
            color={focused ? GOLD : MUTED}
            style={{ marginRight: 2 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={
              searchScope === 'author'
                ? 'Search by author (e.g. Orwell, Rowling)…'
                : searchScope === 'title'
                ? 'Search by title (e.g. Dune, 1984)…'
                : 'Search title, author, or keywords…'
            }
            placeholderTextColor={MUTED}
            value={inputText}
            onChangeText={handleInputChange}
            onSubmitEditing={handleSubmitSearch}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {inputText.length > 0 && (
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleClearSearch}
              style={{ marginRight: 4 }}
            >
              <Ionicons name="close-circle" size={18} color={MUTED} />
            </TouchableOpacity>
          )}
        </View>

        {/* Dedicated Search Action Button */}
        <TouchableOpacity
          style={styles.searchBtn}
          activeOpacity={0.8}
          onPress={handleSubmitSearch}
        >
          {loading ? (
            <ActivityIndicator size="small" color={BG} />
          ) : (
            <Ionicons name="arrow-forward" size={18} color={BG} />
          )}
        </TouchableOpacity>

        {/* Filter Trigger Button */}
        <TouchableOpacity
          style={[styles.filterBtn, isFilterActive && styles.filterBtnActive]}
          activeOpacity={0.75}
          onPress={openFilterModal}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={isFilterActive ? BG : TEXT}
          />
          {isFilterActive && <View style={styles.activeDot} />}
        </TouchableOpacity>
      </View>

      {/* Scope Selector: [ All | Title | Author ] */}
      <View style={styles.scopeRow}>
        <Text style={styles.scopeLabel}>Search In:</Text>
        <View style={styles.scopeSegment}>
          {(['all', 'title', 'author'] as SearchScope[]).map((scope) => {
            const active = searchScope === scope;
            return (
              <TouchableOpacity
                key={scope}
                style={[styles.scopeBtn, active && styles.scopeBtnActive]}
                onPress={() => handleScopeChange(scope)}
                activeOpacity={0.75}
              >
                <Text style={[styles.scopeBtnText, active && styles.scopeBtnTextActive]}>
                  {scope === 'all' ? 'All' : scope === 'title' ? 'Book Title' : 'Author'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Category Pills Row */}
      <View style={styles.pillsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pills}
          nestedScrollEnabled={true}
        >
          {CATEGORIES.map((cat) => {
            const active = activeFilters.genre === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => handleSelectCategory(cat)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Results Header Status & Active Filters Tag */}
      {(isFilterActive || activeQuery.trim().length > 0) && (
        <View style={styles.statusBar}>
          <Text style={styles.resultsCount}>
            {filteredAndSortedBooks.length} {filteredAndSortedBooks.length === 1 ? 'book' : 'books'} found
            {activeQuery.trim() ? ` for "${activeQuery}"` : ''}
          </Text>
          <TouchableOpacity
            style={styles.clearAllBtn}
            onPress={() => {
              handleClearSearch();
              resetFilters();
            }}
          >
            <Text style={styles.clearAllText}>Clear all</Text>
            <Ionicons name="close-circle-outline" size={14} color={GOLD} />
          </TouchableOpacity>
        </View>
      )}

      {/* Main Results Container */}
      {loading && books.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.stateText}>Finding great books…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={44} color="#ef4444" />
          <Text style={[styles.stateText, { color: TEXT, marginBottom: 16 }]}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => performFetch(activeQuery, searchScope, activeFilters.genre, 1, false)}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredAndSortedBooks.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={54} color="#272730" />
          <Text style={styles.emptyTitle}>No matching books found</Text>
          <Text style={styles.stateText}>
            {activeQuery.trim()
              ? `No books matched "${activeQuery}" in ${searchScope === 'all' ? 'any field' : searchScope}.`
              : 'Try selecting a different category or clearing active filters.'}
          </Text>
          {(isFilterActive || activeQuery.trim().length > 0) && (
            <TouchableOpacity
              style={styles.clearFilterBtn}
              onPress={() => {
                handleClearSearch();
                resetFilters();
              }}
            >
              <Text style={styles.clearFilterBtnText}>Reset Search & Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedBooks}
          keyExtractor={(item) => item.google_book_id}
          renderItem={renderCard}
          numColumns={4}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator size="small" color={GOLD} />
              </View>
            ) : null
          }
        />
      )}

      {/* Book Detail Modal */}
      <BookDetailModal
        visible={modalVisible}
        book={selectedBook}
        onClose={() => setModalVisible(false)}
        onStatusChange={handleStatusChange}
      />

      {/* Filter Bottom Sheet Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Refine Books</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={22} color={MUTED} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              nestedScrollEnabled={true}
            >
              {/* Sort Options */}
              <Text style={styles.filterSectionTitle}>Sort Order</Text>
              <View style={styles.chipRow}>
                {[
                  { id: 'relevance', label: 'Relevance' },
                  { id: 'newest', label: 'Newest' },
                  { id: 'title', label: 'Alphabetical' },
                ].map((item) => {
                  const active = tempFilters.sortBy === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setTempFilters({ ...tempFilters, sortBy: item.id as SortOption })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Genre / Category */}
              <Text style={styles.filterSectionTitle}>Genre & Subject</Text>
              <View style={styles.chipWrapRow}>
                {CATEGORIES.map((cat) => {
                  const active = tempFilters.genre === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setTempFilters({ ...tempFilters, genre: cat })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Novel / Book Format */}
              <Text style={styles.filterSectionTitle}>Novel & Book Format</Text>
              <View style={styles.chipWrapRow}>
                {NOVEL_TYPES.map((type) => {
                  const active = tempFilters.novelType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setTempFilters({ ...tempFilters, novelType: type })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Writing Style */}
              <Text style={styles.filterSectionTitle}>Writing Style & Tone</Text>
              <View style={styles.chipWrapRow}>
                {WRITING_STYLES.map((style) => {
                  const active = tempFilters.writingStyle === style;
                  return (
                    <TouchableOpacity
                      key={style}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setTempFilters({ ...tempFilters, writingStyle: style })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{style}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Filter Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                <Text style={styles.resetBtnText}>Reset All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
                <Text style={styles.applyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingTop: 14 },

  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 14,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchBarFocused: {
    borderColor: GOLD,
  },
  searchInput: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchBtn: {
    width: 44,
    height: 46,
    borderRadius: 14,
    backgroundColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBtn: {
    width: 44,
    height: 46,
    borderRadius: 14,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterBtnActive: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  activeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ef4444',
  },

  // Scope Selector Row
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 10,
  },
  scopeLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '600',
  },
  scopeSegment: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 2,
    gap: 2,
  },
  scopeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  scopeBtnActive: {
    backgroundColor: `${GOLD}26`,
    borderWidth: 1,
    borderColor: GOLD,
  },
  scopeBtnText: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },
  scopeBtnTextActive: {
    color: GOLD,
    fontWeight: '700',
  },

  pillsWrapper: {
    marginBottom: 8,
  },
  pills: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pillActive: {
    backgroundColor: `${GOLD}20`,
    borderColor: GOLD,
  },
  pillText: { fontSize: 12, fontWeight: '500', color: MUTED },
  pillTextActive: { color: GOLD, fontWeight: '700' },

  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  resultsCount: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  clearAllText: {
    fontSize: 12,
    color: GOLD,
    fontWeight: '600',
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 110,
  },
  stateText: { color: MUTED, marginTop: 10, textAlign: 'center', fontSize: 13 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
    marginTop: 14,
    marginBottom: 4,
  },
  clearFilterBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: SURFACE_LIGHT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  clearFilterBtnText: {
    color: GOLD,
    fontWeight: '600',
    fontSize: 13,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    backgroundColor: GOLD,
    borderRadius: 10,
  },
  retryBtnText: { color: BG, fontWeight: '700', fontSize: 14 },

  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 110,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  footerLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // Filter Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: TEXT },
  modalScroll: {
    marginVertical: 4,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chipWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: SURFACE_LIGHT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: {
    borderColor: GOLD,
    backgroundColor: `${GOLD}22`,
  },
  chipText: { fontSize: 12, color: MUTED, fontWeight: '500' },
  chipTextActive: { color: GOLD, fontWeight: '700' },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 16 : 0,
  },
  resetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_LIGHT,
  },
  resetBtnText: { color: TEXT, fontWeight: '600', fontSize: 14 },
  applyBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: GOLD,
  },
  applyBtnText: { color: BG, fontWeight: '700', fontSize: 14 },
});