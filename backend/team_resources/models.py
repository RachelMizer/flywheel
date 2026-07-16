from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.contrib.auth.models import User


class TeamResource(models.Model):
    file        = models.FileField(upload_to='team_resources/')
    uploaded_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.file.name


@receiver(post_delete, sender=TeamResource)
def _delete_resource_file(sender, instance, **kwargs):
    """Remove the underlying file from disk on any delete path."""
    instance.file.delete(save=False)
