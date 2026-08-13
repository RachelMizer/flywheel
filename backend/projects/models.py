from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.contrib.auth.models import User


class Project(models.Model):
    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    start_date  = models.DateField(null=True, blank=True)
    end_date    = models.DateField(null=True, blank=True)
    icon        = models.ImageField(upload_to='project_icons/', null=True, blank=True)
    created_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at  = models.DateTimeField(auto_now_add=True)

    # Scrum roles for this project's team. Scrum Master and Product Owner are single
    # people (nullable FKs); the Development Team is a set. All on_delete=SET_NULL/
    # cleared implicitly so removing a user doesn't cascade-delete the project.
    scrum_master  = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='scrum_master_projects')
    product_owner = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='product_owner_projects')
    developers    = models.ManyToManyField(
        User, blank=True, related_name='developer_projects')

    def __str__(self):
        return self.title


@receiver(post_delete, sender=Project)
def _delete_project_icon(sender, instance, **kwargs):
    """Remove the icon file from disk on any delete path."""
    if instance.icon:
        instance.icon.delete(save=False)


class ProjectDocument(models.Model):
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='documents')
    file        = models.FileField(upload_to='project_docs/')
    uploaded_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.file.name


@receiver(post_delete, sender=ProjectDocument)
def _delete_document_file(sender, instance, **kwargs):
    """Remove the underlying file from disk on any delete path (explicit or cascaded from Project)."""
    instance.file.delete(save=False)


class TimelineEvent(models.Model):
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='timeline_events')
    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    date        = models.DateField()
    epic        = models.ForeignKey('backlog.Epic', null=True, blank=True, on_delete=models.SET_NULL, related_name='timeline_points')
    story       = models.ForeignKey('backlog.BacklogItem', null=True, blank=True, on_delete=models.SET_NULL, related_name='timeline_points')
    owner       = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_timeline_events')
    created_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_timeline_events')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'id']

    def __str__(self):
        return f'{self.project.title} — {self.title}'
