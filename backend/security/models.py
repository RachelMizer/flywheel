from django.contrib.auth.models import User
from django.db import models
from rest_framework.authtoken.models import Token

from docker_manager.models import ContainerRecord


class AuditEvent(models.Model):
    """Append-only security log: logins, role changes, share links, uploads, drift."""

    SEV_INFO     = 'info'
    SEV_WARNING  = 'warning'
    SEV_CRITICAL = 'critical'
    SEVERITY_CHOICES = [
        (SEV_INFO, 'Info'),
        (SEV_WARNING, 'Warning'),
        (SEV_CRITICAL, 'Critical'),
    ]

    # Categories group event types for the UI's filter chips.
    CATEGORY_AUTH     = 'auth'
    CATEGORY_ACCESS   = 'access'
    CATEGORY_EXPOSURE = 'exposure'
    CATEGORY_CONTAINER = 'container'
    CATEGORY_CHOICES = [
        (CATEGORY_AUTH, 'Authentication'),
        (CATEGORY_ACCESS, 'Access control'),
        (CATEGORY_EXPOSURE, 'Exposure'),
        (CATEGORY_CONTAINER, 'Container'),
    ]

    event_type   = models.CharField(max_length=40, db_index=True)
    category     = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    severity     = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default=SEV_INFO)
    actor        = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='security_events')
    # Stored as text, not an FK: a failed login names a username that may not
    # exist, and the record must survive the target user's deletion.
    target       = models.CharField(max_length=200, blank=True, db_index=True)
    ip_address   = models.GenericIPAddressField(null=True, blank=True)
    user_agent   = models.CharField(max_length=300, blank=True)
    message      = models.CharField(max_length=500)
    metadata     = models.JSONField(default=dict, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'[{self.severity}] {self.event_type}: {self.message}'


class TokenUsage(models.Model):
    """Last-used tracking for DRF tokens, which have no such field of their own."""

    token        = models.OneToOneField(Token, on_delete=models.CASCADE, primary_key=True,
                                        related_name='usage')
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_ip      = models.GenericIPAddressField(null=True, blank=True)


class ContainerSecurityReport(models.Model):
    """Security posture of one monitored container, as last sent by the reporter agent."""

    container         = models.OneToOneField(ContainerRecord, on_delete=models.CASCADE,
                                             related_name='security')
    privileged        = models.BooleanField(default=False)
    # Effective uid of PID 1 when the agent could read it; otherwise derived from Config.User.
    run_user          = models.CharField(max_length=100, blank=True)
    runs_as_root      = models.BooleanField(default=False)
    network_mode      = models.CharField(max_length=100, blank=True)
    cap_add           = models.JSONField(default=list, blank=True)
    # [{"source", "destination", "rw"}]
    mounts            = models.JSONField(default=list, blank=True)
    # [{"container_port", "protocol", "host_ip", "host_port"}]
    published_ports   = models.JSONField(default=list, blank=True)
    # [{"service": "mqtt"|"redis"|..., "anonymous": bool, "tls": bool|None, "detail": str}]
    services          = models.JSONField(default=list, blank=True)
    image_created     = models.DateTimeField(null=True, blank=True)
    # {"critical": n, "high": n, "medium": n, "low": n} or null when never scanned.
    cve_counts        = models.JSONField(null=True, blank=True)
    cve_scanner       = models.CharField(max_length=50, blank=True)
    scanned_at        = models.DateTimeField(null=True, blank=True)
    # {path: sha256}. Baseline is the accepted state; current is the latest report.
    config_baseline   = models.JSONField(default=dict, blank=True)
    config_current    = models.JSONField(default=dict, blank=True)
    baseline_set_at   = models.DateTimeField(null=True, blank=True)
    baseline_set_by   = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                          related_name='+')
    updated_at        = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'security: {self.container}'


class PasswordAudit(models.Model):
    """Whether a user's *current* password is a known-weak one.

    Checked for free against the plaintext at login, or (for privileged accounts
    that haven't logged in since) by hashing a short candidate list once. Keyed
    to the stored hash, so any password change invalidates the result.
    """

    user          = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True,
                                         related_name='password_audit')
    password_hash = models.CharField(max_length=128)
    weak          = models.BooleanField(default=False)
    checked_at    = models.DateTimeField(auto_now=True)
