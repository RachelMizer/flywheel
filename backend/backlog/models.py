from django.db import models
from django.contrib.auth.models import User


class Epic(models.Model):
    project     = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='epics')
    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class Sprint(models.Model):
    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('active', 'Active'),
        ('completed', 'Completed'),
    ]

    project     = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='sprints')
    number      = models.PositiveIntegerField()
    name        = models.CharField(max_length=200, blank=True)
    goal        = models.TextField(blank=True)
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned')
    start_date  = models.DateField(null=True, blank=True)
    end_date    = models.DateField(null=True, blank=True)
    created_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['project', 'number'], name='unique_sprint_number_per_project'),
        ]

    def __str__(self):
        return self.name or f'Sprint {self.number}'


class BacklogItem(models.Model):
    project     = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='backlog_items')
    title       = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    epic        = models.ForeignKey(Epic, null=True, blank=True, on_delete=models.SET_NULL, related_name='items')
    sprint      = models.ForeignKey(Sprint, null=True, blank=True, on_delete=models.SET_NULL, related_name='items')
    order       = models.PositiveIntegerField(default=0)
    estimate    = models.PositiveIntegerField(null=True, blank=True)
    kanban_card = models.OneToOneField(
        'kanban.Card', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='backlog_item',
    )
    created_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='backlog_items')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


class BacklogActivity(models.Model):
    item_title = models.CharField(max_length=300)
    change     = models.CharField(max_length=500)
    changed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    timestamp  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name_plural = 'backlog activities'

    def __str__(self):
        return f'{self.item_title} — {self.change}'
