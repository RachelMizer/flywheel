from django.db import models
from django.contrib.auth.models import User


class Ticket(models.Model):
    STATUS_OPEN = 'open'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_RESOLVED = 'resolved'
    STATUS_CLOSED = 'closed'

    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_RESOLVED, 'Resolved'),
        (STATUS_CLOSED, 'Closed'),
    ]

    SECTION_CHOICES = [
        ('dashboard', 'Dashboard'),
        ('docker', 'Docker Manager'),
        ('kanban', 'Kanban'),
        ('tickets', 'Tickets'),
        ('support', 'Support Dashboard'),
        ('messages', 'Messages'),
        ('account', 'Account'),
        ('other', 'Other'),
    ]

    ticket_number = models.CharField(max_length=20, unique=True, blank=True, editable=False)
    title = models.CharField(max_length=300)
    site_section = models.CharField(max_length=50, choices=SECTION_CHOICES, blank=True, default='')
    short_description = models.CharField(max_length=500, blank=True)
    detailed_description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    assigned_to = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_tickets'
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='created_tickets'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new and not self.ticket_number:
            self.ticket_number = f'TKT-{self.pk:05d}'
            Ticket.objects.filter(pk=self.pk).update(ticket_number=self.ticket_number)

    def __str__(self):
        return f'[{self.ticket_number}] {self.title}'


class TicketScreenshot(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='screenshots')
    image = models.ImageField(upload_to='ticket_screenshots/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Screenshot for {self.ticket.ticket_number}'


class Comment(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'Comment on {self.ticket.ticket_number}'
