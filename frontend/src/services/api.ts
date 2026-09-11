import { Book, BookStatus } from '../components/BookDetailModal';

export const LOCAL_URL = 'http://127.0.0.1:8000/api';
export const REMOTE_URL = 'https://bookrating-orpin.vercel.app/api';

export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? LOCAL_URL
    : REMOTE_URL);

export interface SearchParams {
  q?: string;
  search?: string;
  title?: string;
  author?: string;
  type?: string;
  scope?: string;
  genre?: string;
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
  page_size?: number;
  signal?: AbortSignal;
}

export interface PaginatedResponse<T> {
  results: T[];
  page: number;
  limit: number;
  has_more: boolean;
  total: number;
}

export interface HomeFeed {
  trending: Book[];
  recommended: Book[];
  genres: Record<string, Book[]>;
}

// Stable client session identifier for shelf isolation (prevents cross-user tampering)
const CLIENT_SESSION_STORAGE_KEY = 'bookrating_client_session_id';

export function getClientSessionId(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    let id = window.localStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (!id) {
      id = 'cs_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
      try {
        window.localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, id);
      } catch {
        // ignore storage errors
      }
    }
    return id;
  }
  return 'cs_default_session';
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const secureHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Session-ID': getClientSessionId(),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...secureHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody?.error || errBody?.message) {
          errorDetail = errBody.error || errBody.message;
        }
      } catch {
        // ignore
      }
      throw new Error(errorDetail);
    }

    return response.json();
  } catch (err: any) {
    // If local dev server is offline or network fails, try remote fallback if BASE_URL was local
    if (BASE_URL === LOCAL_URL && !options.signal?.aborted) {
      try {
        const fallbackUrl = `${REMOTE_URL}${endpoint}`;
        const fbResponse = await fetch(fallbackUrl, {
          ...options,
          headers: {
            ...secureHeaders,
            ...options.headers,
          },
        });
        if (fbResponse.ok) {
          return fbResponse.json();
        }
      } catch {
        // ignore and throw original error
      }
    }
    throw err;
  }
}

/**
 * Fetches the curated Home feed with trending, recommended, and genre shelves.
 * Passes ?refresh=true when pulling to refresh so fresh randomized books are fetched.
 */
export async function fetchHomeFeed(
  refresh = false,
  signal?: AbortSignal
): Promise<HomeFeed> {
  const query = refresh ? `?refresh=true&seed=${Date.now()}` : '';
  const data = await apiFetch<any>(`/books/home/${query}`, { signal });
  return {
    trending: Array.isArray(data?.trending) ? data.trending : [],
    recommended: Array.isArray(data?.recommended) ? data.recommended : [],
    genres: data?.genres && typeof data.genres === 'object' ? data.genres : {},
  };
}

/**
 * Searches books across Google, OpenLibrary, Gutendex, OpenBD with pagination and filters.
 */
export async function searchBooks(
  params: SearchParams = {}
): Promise<PaginatedResponse<Book>> {
  const queryParts: string[] = [];

  const q = params.q || params.search;
  if (q && q.trim()) {
    queryParts.push(`q=${encodeURIComponent(q.trim())}`);
  }

  if (params.title && params.title.trim()) {
    queryParts.push(`title=${encodeURIComponent(params.title.trim())}`);
  }

  if (params.author && params.author.trim()) {
    queryParts.push(`author=${encodeURIComponent(params.author.trim())}`);
  }

  const type = params.type || params.scope;
  if (type && type !== 'all') {
    queryParts.push(`type=${encodeURIComponent(type.trim())}`);
  }

  const genre = params.genre || params.category;
  if (genre && genre !== 'All') {
    queryParts.push(`genre=${encodeURIComponent(genre.trim())}`);
  }

  if (params.status) {
    queryParts.push(`status=${encodeURIComponent(params.status)}`);
  }

  const page = params.page ?? 1;
  queryParts.push(`page=${page}`);

  const limit = params.limit ?? params.page_size ?? 20;
  queryParts.push(`limit=${limit}`);

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const data = await apiFetch<any>(`/books/search/${queryString}`, {
    signal: params.signal,
  });

  if (Array.isArray(data)) {
    return {
      results: data,
      page,
      limit,
      has_more: data.length >= limit,
      total: data.length,
    };
  }

  return {
    results: Array.isArray(data?.results) ? data.results : [],
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    has_more: !!data?.has_more,
    total: data?.total ?? (data?.results ? data.results.length : 0),
  };
}

/**
 * Fetches all user saved books on the shelf.
 */
export async function fetchUserLibrary(signal?: AbortSignal): Promise<Book[]> {
  try {
    const data = await apiFetch<any>('/books/user/', { signal });
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    if (err.message?.includes('404')) return [];
    throw err;
  }
}

/**
 * Saves a new book to the user's shelf in the database.
 */
export async function saveBookToShelf(
  book: Book,
  status: BookStatus,
  rating: number = 0
): Promise<Book> {
  const cleanTitle = String(book.title || 'Unknown Title').slice(0, 255);
  const cleanAuthors = String(
    Array.isArray(book.authors) ? book.authors.join(', ') : book.authors ?? ''
  ).slice(0, 255);
  const cleanCategories = String(
    Array.isArray(book.categories) ? book.categories.join(', ') : book.categories ?? ''
  ).slice(0, 255);
  const cleanDesc = String(book.description ?? '').slice(0, 10000);
  const cleanThumb = String(book.thumbnail ?? '').slice(0, 500);
  const cleanRating = Math.max(0, Math.min(5, Number(rating) || 0));

  return apiFetch<Book>('/books/save/', {
    method: 'POST',
    body: JSON.stringify({
      google_book_id: encodeURIComponent(book.google_book_id),
      title: cleanTitle,
      authors: cleanAuthors,
      description: cleanDesc,
      thumbnail: cleanThumb,
      categories: cleanCategories,
      status,
      rating: cleanRating,
    }),
  });
}

/**
 * Updates or removes status of an existing book on shelf.
 */
export async function updateShelfStatus(
  googleBookId: string,
  newStatus: BookStatus
): Promise<{ message: string; status: BookStatus }> {
  return apiFetch<{ message: string; status: BookStatus }>(
    `/books/${encodeURIComponent(googleBookId)}/status/`,
    {
      method: 'POST',
      body: JSON.stringify({ status: newStatus }),
    }
  );
}
