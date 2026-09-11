import os
import re
import time
import random
import hashlib
import requests
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from django.contrib.auth.models import User
from .models import Book, UserBook
from .serializers import UserBookSerializer

GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY", "")
HEADERS = {'User-Agent': 'BookDiscoveryApp/1.0 (contact@example.com)'}

VALID_STATUSES = {'TO_READ', 'FINISHED', 'FAVORITE'}

# ─── Bounded O(1) LRU Cache with TTL ─────────────────────────────────
_CACHE = OrderedDict()
_CACHE_MAX_SIZE = 500
_CACHE_TTL = 900  # 15 minutes

def get_from_cache(key: str):
    if key in _CACHE:
        val, timestamp = _CACHE[key]
        if time.time() - timestamp < _CACHE_TTL:
            _CACHE.move_to_end(key)
            return val
        del _CACHE[key]
    return None

def set_in_cache(key: str, val):
    if key in _CACHE:
        del _CACHE[key]
    elif len(_CACHE) >= _CACHE_MAX_SIZE:
        _CACHE.popitem(last=False)
    _CACHE[key] = (val, time.time())


# ─── Security Helpers ────────────────────────────────────────────────

def sanitize_thumbnail_url(url: str) -> str:
    """Validates and enforces safe HTTPS image URLs, blocking dangerous protocols."""
    if not url or not isinstance(url, str):
        return ''
    cleaned = url.strip()
    # Reject dangerous protocols (XSS via javascript:, data:, file:, etc.)
    lower = cleaned.lower()
    if lower.startswith(('javascript:', 'data:', 'file:', 'ftp:', 'vbscript:')):
        return ''
    if cleaned.startswith('http://'):
        cleaned = 'https://' + cleaned[7:]
    if not cleaned.startswith('https://'):
        return ''
    return cleaned[:500]


def get_or_create_shelf_user(request):
    """
    Returns the user associated with the request:
    - If user is authenticated, returns request.user.
    - Otherwise, isolates shelf state using client session token (X-Session-ID header)
      or stable client hash to prevent broken access control and data tampering.
    """
    if hasattr(request, 'user') and request.user and request.user.is_authenticated:
        return request.user

    session_header = request.headers.get('X-Session-ID') or request.headers.get('X-Client-ID')
    if session_header and isinstance(session_header, str):
        clean_token = re.sub(r'[^a-zA-Z0-9_\-]', '', session_header.strip())[:48]
        if clean_token:
            username = f"guest_{clean_token[:30]}"
            u, _ = User.objects.get_or_create(username=username)
            return u

    if hasattr(request, 'session') and request.session.session_key:
        username = f"guest_{request.session.session_key[:30]}"
        u, _ = User.objects.get_or_create(username=username)
        return u

    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR', 'anon')
    ip_hash = hashlib.sha256(f"anon_shelf_{ip}".encode()).hexdigest()[:24]
    u, _ = User.objects.get_or_create(username=f"guest_{ip_hash}")
    return u


# ─── API Fetchers with Parameterized Requests & Bounds ───────────────

def fetch_google_books(query, max_results=20, start_index=0):
    clamped_max = min(40, max(1, int(max_results)))
    clamped_start = max(0, int(start_index))
    params = {
        'q': str(query)[:200],
        'startIndex': clamped_start,
        'maxResults': clamped_max,
    }
    if GOOGLE_BOOKS_API_KEY:
        params['key'] = GOOGLE_BOOKS_API_KEY

    try:
        res = requests.get(
            "https://www.googleapis.com/books/v1/volumes",
            params=params,
            headers=HEADERS,
            timeout=4
        )
        if res.status_code != 200:
            return []
        items = res.json().get('items', [])
        books = []
        for item in items:
            info = item.get('volumeInfo', {})
            img_links = info.get('imageLinks', {})
            thumb = img_links.get('thumbnail') or img_links.get('smallThumbnail') or ''
            safe_thumb = sanitize_thumbnail_url(thumb)

            raw_authors = info.get('authors', ['Unknown Author'])
            authors_str = ", ".join(raw_authors) if isinstance(raw_authors, list) else str(raw_authors)

            raw_categories = info.get('categories', ['General'])
            categories_str = ", ".join(raw_categories) if isinstance(raw_categories, list) else str(raw_categories)

            books.append({
                'google_book_id': str(item.get('id', ''))[:128],
                'title': str(info.get('title', 'Unknown Title'))[:255],
                'authors': authors_str[:255],
                'description': str(info.get('description', ''))[:10000],
                'thumbnail': safe_thumb,
                'categories': categories_str[:255],
                'publishedDate': str(info.get('publishedDate', ''))[:30],
            })
        return books
    except Exception:
        return []


def fetch_open_library_books(query, limit=10, page=1):
    clamped_limit = min(20, max(1, int(limit)))
    clamped_page = min(50, max(1, int(page)))
    params = {
        'q': str(query)[:200],
        'limit': clamped_limit,
        'page': clamped_page,
    }
    try:
        res = requests.get(
            "https://openlibrary.org/search.json",
            params=params,
            headers=HEADERS,
            timeout=4
        )
        if res.status_code != 200:
            return []
        docs = res.json().get('docs', [])
        books = []
        for item in docs:
            key = str(item.get('key', '')).replace('/works/', '')
            cover_id = item.get('cover_i')
            cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else ''

            subjects = item.get('subject', [])
            categories_str = ", ".join(subjects[:3]) if isinstance(subjects, list) and subjects else 'General'

            first_sentence = item.get('first_sentence')
            desc = first_sentence[0] if isinstance(first_sentence, list) and first_sentence else ''

            raw_authors = item.get('author_name', ['Unknown Author'])
            authors_str = ", ".join(raw_authors) if isinstance(raw_authors, list) else str(raw_authors)

            books.append({
                'google_book_id': f"ol_{key}"[:128],
                'title': str(item.get('title', 'Unknown Title'))[:255],
                'authors': authors_str[:255],
                'description': str(desc)[:10000],
                'thumbnail': sanitize_thumbnail_url(cover_url),
                'categories': categories_str[:255],
                'publishedDate': str(item.get('first_publish_year', ''))[:30],
            })
        return books
    except Exception:
        return []


def fetch_gutendex_books(query, page=1):
    """Fetches free classic eBooks from Project Gutenberg via Gutendex API."""
    clamped_page = min(50, max(1, int(page)))
    params = {
        'search': str(query)[:200],
        'page': clamped_page,
    }
    try:
        res = requests.get(
            "https://gutendex.com/books/",
            params=params,
            headers=HEADERS,
            timeout=4
        )
        if res.status_code != 200:
            return []
        results = res.json().get('results', [])
        books = []
        for item in results:
            gutenberg_id = item.get('id')
            authors_list = [a.get('name', '') for a in item.get('authors', []) if a.get('name')]
            authors_str = ", ".join(authors_list) if authors_list else 'Unknown Author'
            
            subjects = item.get('subjects', [])
            categories_str = subjects[0].split(' -- ')[0] if subjects else 'Classic Literature'
            
            formats = item.get('formats', {})
            thumbnail = formats.get('image/jpeg', f"https://www.gutenberg.org/cache/epub/{gutenberg_id}/pg{gutenberg_id}.cover.medium.jpg")

            books.append({
                'google_book_id': f"gutenberg_{gutenberg_id}"[:128],
                'title': str(item.get('title', 'Unknown Title'))[:255],
                'authors': authors_str[:255],
                'description': f"Public Domain Classic with {item.get('download_count', 0)} downloads on Project Gutenberg.",
                'thumbnail': sanitize_thumbnail_url(thumbnail),
                'categories': categories_str[:255],
                'publishedDate': '',
            })
        return books
    except Exception:
        return []


def fetch_openbd_books(isbn):
    """OpenBD searches specifically by ISBN with strict digit sanitization."""
    clean_isbn = re.sub(r'[^0-9X]', '', str(isbn).upper())
    if not (10 <= len(clean_isbn) <= 13):
        return []

    try:
        res = requests.get(
            "https://api.openbd.jp/v1/get",
            params={'isbn': clean_isbn},
            headers=HEADERS,
            timeout=3
        )
        if res.status_code != 200:
            return []
        data = res.json()
        if not data or data[0] is None:
            return []

        summary = data[0].get('summary', {})
        cover_url = sanitize_thumbnail_url(summary.get('cover', ''))

        return [{
            'google_book_id': f"obd_{summary.get('isbn', clean_isbn)}"[:128],
            'title': str(summary.get('title', 'Unknown Title'))[:255],
            'authors': str(summary.get('author', 'Unknown Author'))[:255],
            'description': str(summary.get('volume', ''))[:10000],
            'thumbnail': cover_url,
            'categories': 'General',
            'publishedDate': str(summary.get('pubdate', ''))[:30],
        }]
    except Exception:
        return []


def search_all_sources(query, max_results=20, page=1, start_index=0, exclude_ids=None, title='', author='', genre=''):
    """
    Fetches books from Google, OpenLibrary, Gutendex, and OpenBD concurrently in parallel,
    merging and deduplicating results.
    """
    if exclude_ids is None:
        exclude_ids = set()

    cache_key = f"search:{query.lower().strip()}:t{title.lower().strip()}:a{author.lower().strip()}:g{genre.lower().strip()}:p{page}:s{start_index}:l{max_results}"
    cached = get_from_cache(cache_key)
    if cached is not None:
        return [b for b in cached if b.get('google_book_id') not in exclude_ids]

    clean_query = query.replace('-', '').strip()
    is_isbn = clean_query.isdigit() and len(clean_query) in (10, 13)

    results = []
    google_start = start_index if start_index > 0 else (page - 1) * max_results

    # Clean query text for OpenLibrary and Gutendex so Google syntax doesn't break them
    clean_search = re.sub(r'(subject|inauthor|intitle):', '', query).replace('"', '').strip()
    if not clean_search:
        clean_search = (title or author or genre or "popular books").strip()

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(fetch_google_books, query, max_results=max_results, start_index=google_start): 'google',
            executor.submit(fetch_open_library_books, clean_search, limit=10, page=page): 'open_library',
            executor.submit(fetch_gutendex_books, clean_search, page=page): 'gutendex',
        }
        if is_isbn:
            futures[executor.submit(fetch_openbd_books, clean_query)] = 'openbd'

        for future in as_completed(futures):
            try:
                res = future.result()
                if res:
                    results.extend(res)
            except Exception:
                pass

    # Deduplicate results
    seen = set()
    deduped_books = []
    for book in results:
        b_id = book.get('google_book_id', '')
        if b_id in exclude_ids:
            continue

        title_key = book.get('title', '').strip().lower()
        author_key = book.get('authors', '').split(',')[0].strip().lower() if book.get('authors') else ''
        dedupe_key = f"{title_key}|{author_key}"

        if dedupe_key not in seen and b_id not in seen:
            seen.add(dedupe_key)
            if b_id:
                seen.add(b_id)
            deduped_books.append(book)

    final_books = deduped_books[:max_results]
    set_in_cache(cache_key, final_books)
    return final_books


# ─── Home Feed Topic Pools ─────────────────────────────────────────

TRENDING_SEEDS = [
    'subject:bestsellers',
    'subject:fiction',
    'subject:politics',
    'subject:geopolitics',
    'subject:history',
    'subject:award winning books',
    'subject:popular science',
    'subject:philosophy',
]

RECOMMENDED_SEEDS = [
    'subject:classic literature',
    'subject:geography',
    'subject:world politics',
    'subject:psychology',
    'subject:technology',
    'subject:international relations',
    'subject:critical thinking',
    'subject:biography',
]

ALL_GENRES = [
    'Politics',
    'Geopolitics',
    'Geography',
    'Fiction',
    'Technology',
    'Science',
    'History',
    'Philosophy',
    'Psychology',
    'Business',
    'Biography',
    'Mystery',
    'Fantasy',
]


# ─── Django Views ──────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def get_home_feed(request):
    """
    Fetches trending books and curated genres for the Home Tab in parallel.
    Supports ?refresh=true or random parameter to provide randomized fresh books
    with zero duplicates.
    """
    force_refresh = request.GET.get('refresh', '').lower() in ('true', '1')
    random_seed = request.GET.get('seed', '')

    cache_key = "home_feed_static" if not (force_refresh or random_seed) else None
    if cache_key:
        cached_feed = get_from_cache(cache_key)
        if cached_feed:
            return Response(cached_feed, status=status.HTTP_200_OK)

    # Random offset to vary Google Books results on refresh
    random_offset = random.choice([0, 4, 8, 12, 16]) if force_refresh else 0

    # Pick randomized trending and recommended seed queries
    trending_query = random.choice(TRENDING_SEEDS) if force_refresh else 'subject:bestsellers'
    recommended_query = random.choice(RECOMMENDED_SEEDS) if force_refresh else 'subject:award winning books'

    # Shuffle genres pool slightly on refresh
    selected_genres = list(ALL_GENRES)
    if force_refresh:
        random.shuffle(selected_genres)

    feed = {
        'trending': [],
        'recommended': [],
        'genres': {}
    }

    global_seen_ids = set()

    with ThreadPoolExecutor(max_workers=8) as executor:
        trending_future = executor.submit(
            search_all_sources, trending_query, 12, start_index=random_offset
        )
        recommended_future = executor.submit(
            search_all_sources, recommended_query, 12, start_index=(random_offset + 3)
        )
        genre_futures = {
            executor.submit(
                search_all_sources, f'subject:{genre.lower()}', 8, start_index=random_offset
            ): genre
            for genre in selected_genres
        }

        # 1. Trending Books
        try:
            trending_raw = trending_future.result(timeout=6)
            for b in trending_raw:
                bid = b.get('google_book_id')
                if bid and bid not in global_seen_ids:
                    global_seen_ids.add(bid)
                    feed['trending'].append(b)
        except Exception:
            feed['trending'] = []

        # 2. Recommended Books (exclude duplicates from trending)
        try:
            rec_raw = recommended_future.result(timeout=6)
            for b in rec_raw:
                bid = b.get('google_book_id')
                if bid and bid not in global_seen_ids:
                    global_seen_ids.add(bid)
                    feed['recommended'].append(b)
        except Exception:
            feed['recommended'] = []

        # 3. Genre Shelves (exclude duplicates across all shelves)
        for future, genre in genre_futures.items():
            try:
                g_raw = future.result(timeout=6)
                genre_books = []
                for b in g_raw:
                    bid = b.get('google_book_id')
                    if bid and bid not in global_seen_ids:
                        global_seen_ids.add(bid)
                        genre_books.append(b)
                if genre_books:
                    feed['genres'][genre] = genre_books
            except Exception:
                feed['genres'][genre] = []

    if cache_key:
        set_in_cache(cache_key, feed)

    return Response(feed, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def search_google_books(request):
    """
    Search books via Google, OpenLibrary, Gutendex, and OpenBD APIs.
    Supports query aliases: q/search, genre/category, limit/page_size,
    title, author, and scope/type ('all', 'title', 'author').
    Hardened with boundary checks and sanitized parameters.
    """
    raw_query = request.GET.get('q') or request.GET.get('search') or ''
    raw_genre = request.GET.get('genre') or request.GET.get('category') or ''
    raw_title = request.GET.get('title') or ''
    raw_author = request.GET.get('author') or ''
    raw_scope = request.GET.get('type') or request.GET.get('scope') or 'all'

    # Security bounds: clamp lengths to prevent ReDoS / CPU exhaustion
    query = str(raw_query).strip()[:200]
    genre = str(raw_genre).strip()[:100]
    title = str(raw_title).strip()[:200]
    author = str(raw_author).strip()[:200]
    scope = str(raw_scope).lower().strip()[:20]
    if scope not in ('all', 'title', 'author'):
        scope = 'all'

    try:
        page = min(100, max(1, int(request.GET.get('page', 1))))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = min(50, max(1, int(request.GET.get('limit') or request.GET.get('page_size') or 20)))
    except (TypeError, ValueError):
        limit = 20

    # Build Google query parts with targeted qualifiers when appropriate
    google_parts = []
    
    if title:
        google_parts.append(f'intitle:"{title}"')
    elif query and scope == 'title':
        google_parts.append(f'intitle:"{query}"')

    if author:
        google_parts.append(f'inauthor:"{author}"')
    elif query and scope == 'author':
        google_parts.append(f'inauthor:"{query}"')

    if query and scope not in ('title', 'author') and not (title or author):
        google_parts.append(query)

    if genre and genre.lower() != 'all':
        google_parts.append(f"subject:{genre}")

    combined_query = " ".join(google_parts).strip()
    if not combined_query:
        combined_query = "popular books"

    # Search local database for instant matches
    local_books = []
    try:
        search_target = (title or author or query).strip()
        if search_target or (genre and genre.lower() != 'all'):
            q_filter = Q()
            if title or (scope == 'title' and query):
                t_term = title or query
                q_filter &= Q(title__icontains=t_term)
            elif author or (scope == 'author' and query):
                a_term = author or query
                q_filter &= Q(authors__icontains=a_term)
            elif search_target:
                q_filter &= (Q(title__icontains=search_target) | Q(authors__icontains=search_target))

            if genre and genre.lower() != 'all':
                q_filter &= Q(categories__icontains=genre)

            for b in Book.objects.filter(q_filter)[:5]:
                local_books.append({
                    'google_book_id': b.google_book_id,
                    'title': b.title,
                    'authors': b.authors or 'Unknown Author',
                    'description': b.description or '',
                    'thumbnail': b.thumbnail or '',
                    'categories': b.categories or 'General',
                    'publishedDate': '',
                })
    except Exception:
        pass

    api_books = search_all_sources(
        combined_query,
        max_results=limit,
        page=page,
        title=title,
        author=author,
        genre=genre
    )

    seen_ids = set()
    merged_books = []
    for b in local_books + api_books:
        bid = b.get('google_book_id')
        if bid and bid not in seen_ids:
            seen_ids.add(bid)
            merged_books.append(b)

    books = merged_books[:limit]

    # Annotate user shelf status scoped to isolated session user
    shelf_user = get_or_create_shelf_user(request)
    try:
        shelved = {
            ub.book.google_book_id: ub.status
            for ub in UserBook.objects.filter(Q(user=shelf_user) | Q(user=None)).select_related('book')
        }
        for b in books:
            if 'status' not in b or not b['status']:
                b['status'] = shelved.get(b['google_book_id'], None)
    except Exception:
        pass

    response_data = {
        'results': books,
        'page': page,
        'limit': limit,
        'has_more': len(books) >= limit,
        'total': len(books),
    }

    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def save_book_status(request):
    raw_id = request.data.get('google_book_id')
    status_val = request.data.get('status')
    rating_val = request.data.get('rating', 0)

    if not raw_id or not status_val:
        return Response(
            {"error": "google_book_id and status are required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    clean_id = re.sub(r'[^a-zA-Z0-9_\-:.@]', '', str(raw_id).strip())[:128]
    if not clean_id:
        return Response(
            {"error": "Invalid google_book_id format"},
            status=status.HTTP_400_BAD_REQUEST
        )

    status_clean = str(status_val).strip().upper()
    if status_clean not in VALID_STATUSES:
        return Response(
            {"error": f"Invalid status '{status_val}'. Must be one of: {', '.join(sorted(VALID_STATUSES))}"},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        rating_int = max(0, min(5, int(rating_val)))
    except (TypeError, ValueError):
        rating_int = 0

    title = str(request.data.get('title', 'Unknown Title')).strip()[:255] or 'Unknown Title'
    authors = str(request.data.get('authors', 'Unknown Author')).strip()[:255]
    categories = str(request.data.get('categories', 'General')).strip()[:255]
    description = str(request.data.get('description', '')).strip()[:10000]
    thumbnail = sanitize_thumbnail_url(str(request.data.get('thumbnail', '')))

    book, _ = Book.objects.get_or_create(
        google_book_id=clean_id,
        defaults={
            'title': title,
            'authors': authors,
            'description': description,
            'thumbnail': thumbnail,
            'categories': categories,
        }
    )

    shelf_user = get_or_create_shelf_user(request)
    user_book, _ = UserBook.objects.update_or_create(
        user=shelf_user,
        book=book,
        defaults={'status': status_clean, 'rating': rating_int}
    )

    return Response(UserBookSerializer(user_book).data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_user_library(request):
    shelf_user = get_or_create_shelf_user(request)
    user_books = UserBook.objects.filter(user=shelf_user).select_related('book').order_by('-updated_at')

    # If isolated session has no books, provide seamless fallback to demo books
    if not user_books.exists():
        legacy_books = UserBook.objects.filter(user=None).select_related('book').order_by('-updated_at')
        if legacy_books.exists():
            return Response(UserBookSerializer(legacy_books, many=True).data, status=status.HTTP_200_OK)

    return Response(
        UserBookSerializer(user_books, many=True).data,
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def get_user_shelf(request):
    shelf_status = (request.GET.get('status') or 'TO_READ').strip().upper()[:20]
    if shelf_status not in VALID_STATUSES:
        shelf_status = 'TO_READ'

    shelf_user = get_or_create_shelf_user(request)
    user_books = UserBook.objects.filter(
        user=shelf_user, status=shelf_status
    ).select_related('book').order_by('-updated_at')

    if not user_books.exists():
        legacy_books = UserBook.objects.filter(
            user=None, status=shelf_status
        ).select_related('book').order_by('-updated_at')
        if legacy_books.exists():
            return Response(UserBookSerializer(legacy_books, many=True).data, status=status.HTTP_200_OK)

    return Response(
        UserBookSerializer(user_books, many=True).data,
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def update_book_status(request, google_book_id):
    clean_id = re.sub(r'[^a-zA-Z0-9_\-:.@]', '', str(google_book_id).strip())[:128]
    if not clean_id:
        return Response(
            {"error": "Invalid book ID"},
            status=status.HTTP_400_BAD_REQUEST
        )

    new_status = request.data.get('status')
    if new_status:
        new_status = str(new_status).strip().upper()
        if new_status not in VALID_STATUSES:
            return Response(
                {"error": f"Invalid status '{new_status}'. Must be one of: {', '.join(sorted(VALID_STATUSES))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

    try:
        book = Book.objects.get(google_book_id=clean_id)
    except Book.DoesNotExist:
        return Response(
            {"error": f"Book '{clean_id}' not found"},
            status=status.HTTP_404_NOT_FOUND
        )

    shelf_user = get_or_create_shelf_user(request)
    user_book = UserBook.objects.filter(user=shelf_user, book=book).first()
    if not user_book:
        user_book = UserBook.objects.filter(user=None, book=book).first()

    if not new_status:
        if user_book:
            user_book.delete()
        return Response(
            {"message": "Book removed from shelf", "status": None},
            status=status.HTTP_200_OK
        )

    if user_book is None:
        user_book = UserBook.objects.create(
            user=shelf_user,
            book=book,
            status=new_status
        )
    elif user_book.status == new_status:
        user_book.delete()
        return Response(
            {"message": "Book removed from shelf", "status": None},
            status=status.HTTP_200_OK
        )
    else:
        user_book.user = shelf_user
        user_book.status = new_status
        user_book.save()

    return Response(
        {"message": f"Book moved to {new_status}", "status": user_book.status},
        status=status.HTTP_200_OK
    )