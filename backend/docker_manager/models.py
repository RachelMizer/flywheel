from django.db import models


class ContainerRecord(models.Model):
    STATUS_HEALTHY = 'healthy'
    STATUS_WORKING = 'working'
    STATUS_DOWN    = 'down'
    STATUS_CHOICES = [
        (STATUS_HEALTHY, 'Healthy'),
        (STATUS_WORKING, 'Working'),
        (STATUS_DOWN,    'Down'),
    ]

    container_id = models.CharField(max_length=100, unique=True)
    name         = models.CharField(max_length=200)
    cluster      = models.CharField(max_length=200, blank=True, default='')
    image        = models.CharField(max_length=200)
    notes        = models.TextField(blank=True)
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_HEALTHY)
    last_seen    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['cluster', 'name']

    def __str__(self):
        return f'{self.cluster or "—"} / {self.name}'
