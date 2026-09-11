# 📚 BookLib — Mobile Book Discovery & Personal Library

**BookLib** is a high-performance, mobile-first book discovery and personal library management application built with **React Native (Expo)** and **Django REST Framework (DRF)**.

Discover trending titles, search across millions of books from multiple global sources, filter by genre, format, writing style, and manage your reading shelves with instant optimistic synchronization.

---

## 🌟 Key Features

### 🔍 Fast & Resilient Book Discovery

* **Multi-Source Aggregation**: Concurrently fetches books from Google Books, OpenLibrary, Gutendex (Project Gutenberg), and OpenBD.
* **Randomized Home Feed on Refresh**: Pull-to-refresh dynamically shuffles genres, seed topics, and query offsets for endless discovery without duplicate books.
* **350ms Debounced Search**: Fast search with automatic race condition cancellation (`AbortController`) to eliminate keystroke spam.
* **Infinite Scroll Pagination**: Smooth batch loading (`onEndReached`) as you scroll.

### 🎯 Comprehensive Multi-Filtering

* **Expanded Genres & Subjects**: Search and filter by **Politics**, **Geopolitics**, **Geography**, **Philosophy**, **Science**, **History**, **Technology**, **Fiction**, **Psychology**, **Business**, and more.
* **Book & Novel Formats**: Refine by *Novel, Series, Short Stories, Graphic Novel, Non-Fiction, Essay / Treatise, Biography / Memoir*.
* **Writing Style & Tone**: Filter by *Literary, Analytical, Dark, Lighthearted, Academic, Poetic, Thriller, Philosophical*.
* **Sort Orders**: Sort by *Relevance* or *Newest*.

### 📱 Responsive 4-Column Mobile Grid & UI/UX

* **4 Books Per Row on Mobile**: High-density, balanced grid layout optimized for mobile screens.
* **Proportional 2:3 Book Covers**: Powered by [`expo-image`](https://docs.expo.dev/versions/latest/sdk/image/) with disk-memory caching and fade transitions to eliminate layout shifts (CLS).
* **Interactive Shelf Status Modal**: View detailed book descriptions, category tags, author details, and update your shelf status (*To Read*, *Finished*, *Favorites*) in real-time.
* **Floating Glassmorphic Tab Bar**: Modern floating navigation bar with clearance padding so no cards are obscured.

### ⚡ Backend Performance & Caching

* **Multithreaded API Fetching**: Concurrently queries external providers via Python's `ThreadPoolExecutor` (~400ms vs 20s+).
* **In-Memory TTL Caching**: Frequently requested feeds and queries are cached in memory for sub-millisecond responses.
* **Cross-Shelf Deduplication**: Automatically deduplicates titles across all sections.

---

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| **Mobile Frontend** | [React Native](https://reactnative.dev/) (0.86) + [Expo](https://expo.dev/) (SDK 57) |
| **Routing** | [Expo Router](https://docs.expo.dev/router/introduction/) |
| **Image Pipeline** | `expo-image` (memory-disk caching & blurhash placeholders) |
| **Icons & Design** | `@expo/vector-icons` (`Ionicons`), Custom Gold/Dark Glassmorphism Design Tokens |
| **Backend API** | [Django](https://www.djangoproject.com/) 5.x + [Django REST Framework](https://www.django-rest-framework.org/) |
| **Concurrency** | `concurrent.futures.ThreadPoolExecutor` |
| **Database** | SQLite (Local Dev) / PostgreSQL (Neon in Production) |

---

## 🚀 Getting Started

### 1. Prerequisites

* [Node.js](https://nodejs.org/) (v18+)
* [Python](https://www.python.org/) (v3.10+)
* [Expo Go](https://expo.dev/go) app on iOS or Android (for mobile testing)

---

### 2. Backend Setup (Django)

```bash
# Navigate to backend directory
cd backend

# Activate virtual environment (Windows PowerShell)
.\venv\Scripts\activate

# Or on macOS/Linux:
# source venv/bin/activate

# Navigate to Django project folder
cd bookrating

# Run database migrations
python manage.py migrate

# Start Django development server
python manage.py runserver
```

Backend will be live at: `http://127.0.0.1:8000/api/`

---

### 3. Frontend Setup (React Native / Expo)

```bash
# Open a new terminal and navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start the Expo development server
npx expo start
```

#### Viewing the App

* **Web Browser**: Press **`w`** in the Expo terminal.
* **Physical Mobile Device**: Scan the QR code using the **Expo Go** app (Android) or **Camera** (iOS).
* **Android Emulator**: Press **`a`**.
* **iOS Simulator**: Press **`i`**.

---

## 📁 Project Structure

```text
book-rating/
├── backend/
│   ├── bookrating/
│   │   ├── app/
│   │   │   ├── models.py         # Book & UserBook database models
│   │   │   ├── serializers.py    # DRF Serializers
│   │   │   ├── urls.py           # API endpoints (/books/, /books/home/, /books/search/)
│   │   │   └── views.py          # Parallel search, caching & shelf handlers
│   │   ├── bookrating/
│   │   │   ├── settings.py       # Django settings & CORS configuration
│   │   │   └── urls.py           # Root URL router
│   │   └── manage.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── _layout.tsx       # Floating glassmorphic tab navigator
│   │   │   ├── index.tsx         # Discover (Home) screen with pull-to-refresh
│   │   │   ├── explore.tsx       # 4-col Search screen with debounced multi-filters
│   │   │   └── library.tsx       # 4-col My Shelf screen with status tabs & counts
│   │   ├── components/
│   │   │   ├── BookCard.tsx      # Memoized 4-col book card with expo-image
│   │   │   └── BookDetailModal.tsx # Book details & shelf management modal
│   │   └── services/
│   │       └── api.ts            # Centralized typed API service with request cancellation
│   ├── app.json
│   ├── eas.json
│   └── package.json
├── .gitignore
└── README.md
```

---

## 🔒 Environment & Security

Sensitive credentials, environment files, local SQLite databases, build artifacts, and secrets are strictly ignored via `.gitignore`:

* `.env*`
* `*.jks`, `*.keystore`, `*.pem`, `*.key`
* `db.sqlite3`
* `node_modules/`, `.expo/`, `dist/`, `android/`, `ios/`
* `__pycache__/`, `venv/`

To configure a Google Books API key, add `GOOGLE_BOOKS_API_KEY=your_key_here` to your local `backend/bookrating/.env` file.

---

## 📄 License

This project is licensed under the MIT License.
