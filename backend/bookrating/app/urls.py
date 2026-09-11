from django.urls import path
from . import views

urlpatterns = [
    path('books/', views.search_google_books),
    path('books/home/', views.get_home_feed),
    path('books/search/', views.search_google_books),
    path('books/save/', views.save_book_status),
    path('books/shelf/', views.get_user_shelf),
    path('books/user/', views.get_user_library),
    path('books/<str:google_book_id>/status/', views.update_book_status),

    # ── Chatbot ──────────────────────────────────────────────────────────
    path('chat/', views.ChatbotView.as_view()),
    path('chat/clear/', views.ClearChatView.as_view()),
    path('chat/history/<int:index>/', views.LoadHistoryView.as_view()),
]