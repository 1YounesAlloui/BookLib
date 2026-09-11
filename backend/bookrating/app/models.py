from django.db import models
from django.contrib.auth.models import User


class Book(models.Model):
    google_book_id = models.CharField(max_length=255, unique=True)
    title = models.CharField(max_length=255)
    authors = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    thumbnail = models.URLField(max_length=500, blank=True, null=True)
    categories = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.title


class UserBook(models.Model):
    STATUS_CHOICES = [
        ('TO_READ', 'To Read'),
        ('FINISHED', 'Finished'),
        ('FAVORITE', 'Favorite'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='user_statuses')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    rating = models.FloatField(default=0.0)
    review = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # One shelf entry per book — status is just a field on that entry,
        # not part of the uniqueness constraint
        unique_together = ('user', 'book')

    def __str__(self):
        return f"{self.book.title} - {self.status} ({self.rating}★)"