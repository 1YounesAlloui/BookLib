import os
import re
import time
import random
import requests
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from .models import Book, UserBook
from .serializers import UserBookSerializer
from rest_framework.views import APIView

from .ai_engine import get_ai_response
from .serializers import ChatMessageSerializer
from .throttles import ChatbotThrottle



logger = logging.getLogger(__name__)


GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY", "")
HEADERS = {'User-Agent': 'BookDiscoveryApp/1.0 (contact@example.com)'}

# ─── Simple In-Memory TTL Cache for Fast Book Loading ───────────────
_CACHE = {}
_CACHE_TTL = 900  # 15 minutes

def get_from_cache(key: str):
    if key in _CACHE:
        val, timestamp = _CACHE[key]
        if time.time() - timestamp < _CACHE_TTL:
            return val
        else:
            del _CACHE[key]
    return None

def set_in_cache(key: str, val):
    if len(_CACHE) > 500:
        oldest_key = min(_CACHE.keys(), key=lambda k: _CACHE[k][1])
        _CACHE.pop(oldest_key, None)
    _CACHE[key] = (val, time.time())


# ─── API Fetchers with Timeout & Safety ──────────────────────────────

def fetch_google_books(query, max_results=20, start_index=0):
    url = (
        f"https://www.googleapis.com/books/v1/volumes"
        f"?q={query}&startIndex={start_index}&maxResults={max_results}"
    )
    if GOOGLE_BOOKS_API_KEY:
        url += f"&key={GOOGLE_BOOKS_API_KEY}"

    try:
        res = requests.get(url, headers=HEADERS, timeout=4)
        if res.status_code != 200:
            return []
        items = res.json().get('items', [])
        books = []
        for item in items:
            info = item.get('volumeInfo', {})
            img_links = info.get('imageLinks', {})
            thumb = img_links.get('thumbnail') or img_links.get('smallThumbnail') or ''
            if thumb.startswith('http://'):
                thumb = 'https://' + thumb[7:]

            books.append({
                'google_book_id': item.get('id', ''),
                'title': info.get('title', 'Unknown Title'),
                'authors': ", ".join(info.get('authors', ['Unknown Author'])),
                'description': info.get('description', ''),
                'thumbnail': thumb,
                'categories': ", ".join(info.get('categories', ['General'])),
                'publishedDate': info.get('publishedDate', ''),
            })
        return books
    except Exception:
        return []


def fetch_open_library_books(query, limit=10, page=1):
    url = f"https://openlibrary.org/search.json?q={query}&limit={limit}&page={page}"
    try:
        res = requests.get(url, headers=HEADERS, timeout=4)
        if res.status_code != 200:
            return []
        docs = res.json().get('docs', [])
        books = []
        for item in docs:
            key = item.get('key', '').replace('/works/', '')
            cover_id = item.get('cover_i')
            cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else ''

            subjects = item.get('subject', [])
            categories_str = ", ".join(subjects[:3]) if isinstance(subjects, list) and subjects else 'General'

            first_sentence = item.get('first_sentence')
            desc = first_sentence[0] if isinstance(first_sentence, list) and first_sentence else ''

            books.append({
                'google_book_id': f"ol_{key}",
                'title': item.get('title', 'Unknown Title'),
                'authors': ", ".join(item.get('author_name', ['Unknown Author'])),
                'description': desc,
                'thumbnail': cover_url,
                'categories': categories_str,
                'publishedDate': str(item.get('first_publish_year', '')),
            })
        return books
    except Exception:
        return []


def fetch_gutendex_books(query, page=1):
    """Fetches free classic eBooks from Project Gutenberg via Gutendex API."""
    url = f"https://gutendex.com/books/?search={query}&page={page}"
    try:
        res = requests.get(url, headers=HEADERS, timeout=4)
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
                'google_book_id': f"gutenberg_{gutenberg_id}",
                'title': item.get('title', 'Unknown Title'),
                'authors': authors_str,
                'description': f"Public Domain Classic with {item.get('download_count', 0)} downloads on Project Gutenberg.",
                'thumbnail': thumbnail,
                'categories': categories_str,
                'publishedDate': '',
            })
        return books
    except Exception:
        return []


def fetch_openbd_books(isbn):
    """OpenBD searches specifically by ISBN."""
    clean_isbn = isbn.replace('-', '').strip()
    url = f"https://api.openbd.jp/v1/get?isbn={clean_isbn}"
    try:
        res = requests.get(url, headers=HEADERS, timeout=3)
        if res.status_code != 200:
            return []
        data = res.json()
        if not data or data[0] is None:
            return []

        summary = data[0].get('summary', {})
        return [{
            'google_book_id': f"obd_{summary.get('isbn', clean_isbn)}",
            'title': summary.get('title', 'Unknown Title'),
            'authors': summary.get('author', 'Unknown Author'),
            'description': summary.get('volume', ''),
            'thumbnail': summary.get('cover', ''),
            'categories': 'General',
            'publishedDate': summary.get('pubdate', ''),
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
    Supports Politics, Geography, Geopolitics, and all genres.
    Returns structured results with pagination metadata.
    """
    query = request.GET.get('q') or request.GET.get('search') or ''
    genre = request.GET.get('genre') or request.GET.get('category') or ''
    title = request.GET.get('title') or ''
    author = request.GET.get('author') or ''
    scope = (request.GET.get('type') or request.GET.get('scope') or 'all').lower().strip()

    try:
        page = int(request.GET.get('page', 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(request.GET.get('limit') or request.GET.get('page_size') or 20)
    except (TypeError, ValueError):
        limit = 20

    # Build Google query parts with targeted qualifiers when appropriate
    google_parts = []
    
    if title:
        google_parts.append(f'intitle:"{title.strip()}"')
    elif query and scope == 'title':
        google_parts.append(f'intitle:"{query.strip()}"')

    if author:
        google_parts.append(f'inauthor:"{author.strip()}"')
    elif query and scope == 'author':
        google_parts.append(f'inauthor:"{query.strip()}"')

    if query and scope not in ('title', 'author') and not (title or author):
        google_parts.append(query.strip())

    if genre and genre.lower() != 'all':
        google_parts.append(f"subject:{genre.strip()}")

    combined_query = " ".join(google_parts).strip()
    if not combined_query:
        combined_query = "popular books"

    # Search local database for instant matches (e.g. user-saved/shelved books)
    local_books = []
    try:
        search_target = (title or author or query).strip()
        if search_target or (genre and genre.lower() != 'all'):
            q_filter = Q()
            if title or (scope == 'title' and query):
                t_term = title or query
                q_filter &= Q(title__icontains=t_term.strip())
            elif author or (scope == 'author' and query):
                a_term = author or query
                q_filter &= Q(authors__icontains=a_term.strip())
            elif search_target:
                q_filter &= (Q(title__icontains=search_target) | Q(authors__icontains=search_target))

            if genre and genre.lower() != 'all':
                q_filter &= Q(categories__icontains=genre.strip())

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

    # Merge local and API books, prioritizing local matching books without duplicates
    seen_ids = set()
    merged_books = []
    for b in local_books + api_books:
        bid = b.get('google_book_id')
        if bid and bid not in seen_ids:
            seen_ids.add(bid)
            merged_books.append(b)

    books = merged_books[:limit]

    # Annotate user shelf status
    try:
        shelved = {
            ub.book.google_book_id: ub.status
            for ub in UserBook.objects.filter(user=None).select_related('book')
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
    google_book_id = request.data.get('google_book_id')
    status_val = request.data.get('status')
    rating_val = request.data.get('rating', 0.0)
    review_val = request.data.get('review', '')

    if not google_book_id or not status_val:
        return Response(
            {"error": "google_book_id and status are required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        rating_float = float(rating_val) if rating_val is not None else 0.0
        rating_float = max(0.0, min(5.0, round(rating_float * 2) / 2))
    except (ValueError, TypeError):
        rating_float = 0.0

    book, _ = Book.objects.get_or_create(
        google_book_id=google_book_id,
        defaults={
            'title': request.data.get('title', ''),
            'authors': request.data.get('authors', ''),
            'description': request.data.get('description', ''),
            'thumbnail': request.data.get('thumbnail', ''),
            'categories': request.data.get('categories', ''),
        }
    )

    user_book, _ = UserBook.objects.update_or_create(
        user=None,
        book=book,
        defaults={
            'status': status_val,
            'rating': rating_float,
            'review': str(review_val or ''),
        }
    )

    return Response(UserBookSerializer(user_book).data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_user_library(request):
    user_books = UserBook.objects.filter(user=None).select_related('book').order_by('-updated_at')
    return Response(
        UserBookSerializer(user_books, many=True).data,
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def get_user_shelf(request):
    shelf_status = request.GET.get('status', 'TO_READ').upper()
    user_books = UserBook.objects.filter(
        user=None, status=shelf_status
    ).select_related('book').order_by('-updated_at')
    return Response(
        UserBookSerializer(user_books, many=True).data,
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def update_book_status(request, google_book_id):
    new_status = request.data.get('status')
    rating_val = request.data.get('rating')
    review_val = request.data.get('review')
    remove_flag = request.data.get('remove', False)

    try:
        book = Book.objects.get(google_book_id=google_book_id)
    except Book.DoesNotExist:
        return Response(
            {"error": f"Book '{google_book_id}' not found"},
            status=status.HTTP_404_NOT_FOUND
        )

    user_book = UserBook.objects.filter(user=None, book=book).first()

    # Explicit remove request or null status without rating/review
    if remove_flag or (not new_status and rating_val is None and review_val is None):
        if user_book:
            user_book.delete()
        return Response(
            {"message": "Book removed from shelf", "status": None},
            status=status.HTTP_200_OK
        )

    if user_book is None:
        user_book = UserBook.objects.create(
            user=None,
            book=book,
            status=new_status or 'TO_READ'
        )
    elif new_status and user_book.status == new_status and rating_val is None and review_val is None:
        # Toggling current status off
        user_book.delete()
        return Response(
            {"message": "Book removed from shelf", "status": None},
            status=status.HTTP_200_OK
        )
    elif new_status:
        user_book.status = new_status

    if rating_val is not None:
        try:
            r = max(0.0, min(5.0, round(float(rating_val) * 2) / 2))
            user_book.rating = r
        except (ValueError, TypeError):
            pass

    if review_val is not None:
        user_book.review = str(review_val)

    user_book.save()

    return Response(UserBookSerializer(user_book).data, status=status.HTTP_200_OK)


#chatbot


# ---------------------------------------------------------------------------
# Chatbot API
# ---------------------------------------------------------------------------

class ChatbotView(APIView):
    """
    POST /api/chat/

    Accept a user message, call the LLM, update session history, return reply.

    Request body (JSON):
        { "message": "<user text>" }

    Response 200:
        { "response": "<ai reply>" }

    Response 400 (validation error):
        { "message": ["<error detail>"] }

    Response 429 (throttled):
        { "detail": "Request was throttled." }

    Response 503 (AI service error):
        { "error": "<safe error message>" }
    """

    throttle_classes = [ChatbotThrottle]

    def post(self, request):
        serializer = ChatMessageSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user_message = serializer.validated_data["message"]
        history = request.session.get("chat_history", [])

        # ── Build shelf context from the user's saved books ──────────────
        shelf_context = ""
        try:
            user_books = UserBook.objects.select_related("book").order_by("-updated_at")[:30]
            if user_books.exists():
                lines = []
                for ub in user_books:
                    b = ub.book
                    status_label = {
                        "TO_READ": "wants to read",
                        "FINISHED": "has finished reading",
                        "FAVORITE": "marked as favourite",
                    }.get(ub.status, ub.status)
                    line = f'- "{b.title}" by {b.authors or "Unknown"} ({status_label})'
                    if ub.rating and ub.rating > 0:
                        line += f" [User Rating: {ub.rating}/5 stars]"
                    if ub.review and ub.review.strip():
                        line += f' [User Review: "{ub.review.strip()}"]'
                    if b.categories:
                        line += f" — genres: {b.categories}"
                    lines.append(line)
                shelf_context = "\n".join(lines)
        except Exception as exc:
            logger.warning("Could not build shelf context: %s", exc)

        result = get_ai_response(user_message, history, shelf_context=shelf_context)

        if not result["ok"]:
            logger.warning("AI error returned to client: %s", result["error"])
            return Response(
                {"error": result["error"]},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        bot_reply = result["content"]

        # Persist conversation to session (keep last 10 entries = 5 pairs)
        history.append({"role": "user", "content": user_message})
        history.append({"role": "assistant", "content": bot_reply})
        request.session["chat_history"] = history[-10:]
        request.session.modified = True

        return Response({"response": bot_reply}, status=status.HTTP_200_OK)


class ClearChatView(APIView):
    """
    POST /api/chat/clear/

    Clear the session's chat history (triggers "New Chat" on the frontend).

    Response 200:
        { "status": "ok" }
    """

    def post(self, request):
        request.session.pop("chat_history", None)
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class LoadHistoryView(APIView):
    """
    GET /api/chat/history/<int:index>/

    Replay a single exchange from session history by its pair index.
    `index` refers to the position of the *user* message in the flat list.
    A valid user-message index must be even (0, 2, 4, ...) and have a
    corresponding assistant message at index+1.

    Response 200:
        { "user_message": "...", "bot_message": "..." }

    Response 400 (invalid index):
        { "error": "Invalid history index." }

    Response 404 (not found):
        { "error": "History entry not found." }
    """

    def get(self, request, index):
        # Validate index is a non-negative even number (user-message positions)
        if index < 0 or index % 2 != 0:
            return Response(
                {"error": "Invalid history index."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        history = request.session.get("chat_history", [])

        try:
            user_msg = history[index]["content"]
            bot_msg = history[index + 1]["content"]
        except (IndexError, KeyError):
            return Response(
                {"error": "History entry not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {"user_message": user_msg, "bot_message": bot_msg},
            status=status.HTTP_200_OK,
        )
