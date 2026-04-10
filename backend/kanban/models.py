from django.db import models
from django.contrib.auth.models import User


class Board(models.Model):
    name       = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Column(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='columns')
    name  = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.board.name} — {self.name}'


class Card(models.Model):
    column      = models.ForeignKey(Column, on_delete=models.CASCADE, related_name='cards')
    title       = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    order       = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.title


class CardActivity(models.Model):
    board      = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='activities')
    card_title = models.CharField(max_length=300)
    change     = models.CharField(max_length=500)
    changed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    timestamp  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f'{self.board.name}: {self.card_title} — {self.change}'
