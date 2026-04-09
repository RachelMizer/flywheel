from django.db import models


class ContainerRecord(models.Model):
    container_id = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=200)
    image = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    last_seen = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
