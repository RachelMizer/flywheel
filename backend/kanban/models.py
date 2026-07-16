from django.db import models
from django.contrib.auth.models import User


class Board(models.Model):
    VISIBILITY_CHOICES = [
        ('private', 'Private'),
        ('public', 'Public'),
    ]

    name                  = models.CharField(max_length=200)
    owner                 = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_boards')
    visibility            = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default='private')
    share_token           = models.CharField(max_length=40, null=True, blank=True, unique=True)
    link_sharing_enabled  = models.BooleanField(default=False)
    created_at            = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class BoardMembership(models.Model):
    ROLE_CHOICES = [
        ('view', 'View'),
        ('edit', 'Edit'),
    ]

    board       = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='memberships')
    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='board_memberships')
    role        = models.CharField(max_length=10, choices=ROLE_CHOICES, default='view')
    invited_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['board', 'user'], name='unique_board_membership'),
        ]

    def __str__(self):
        return f'{self.board.name} — {self.user.username} ({self.role})'


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
    assigned_to = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='assigned_cards',
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.title


class Checklist(models.Model):
    card  = models.ForeignKey(Card, on_delete=models.CASCADE, related_name='checklists')
    name  = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.card.title} — {self.name}'


class ChecklistItem(models.Model):
    checklist = models.ForeignKey(Checklist, on_delete=models.CASCADE, related_name='items')
    text      = models.CharField(max_length=500)
    checked   = models.BooleanField(default=False)
    order     = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.text


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
