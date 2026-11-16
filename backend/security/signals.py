from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import Group, User
from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.db.models.signals import m2m_changed, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from kanban.models import Board
from team_resources.models import TeamResource

from .audit import client_ip, is_suppressed, record
from .models import AuditEvent

BRUTE_FORCE_WINDOW = timedelta(minutes=15)
BRUTE_FORCE_THRESHOLD = 5
PRIVILEGED_GROUPS = {'manager', 'support-admin', 'support'}


# ── Authentication ───────────────────────────────────────────────────────────

@receiver(user_login_failed)
def _on_login_failed(sender, credentials, request=None, **kwargs):
    username = (credentials or {}).get('username') or ''
    exists = User.objects.filter(username=username).exists()
    record(
        'login_failed', AuditEvent.CATEGORY_AUTH,
        f'Failed login for "{username}"' + ('' if exists else ' (unknown user)'),
        severity=AuditEvent.SEV_WARNING, target=username, request=request, actor=None,
        metadata={'unknown_user': not exists},
    )
    since = timezone.now() - BRUTE_FORCE_WINDOW
    recent = AuditEvent.objects.filter(event_type='login_failed', target=username,
                                       created_at__gte=since).count()
    # Fire exactly once as the threshold is crossed, not on every later failure.
    if recent == BRUTE_FORCE_THRESHOLD:
        record(
            'brute_force_suspected', AuditEvent.CATEGORY_AUTH,
            f'{recent} failed logins for "{username}" within '
            f'{int(BRUTE_FORCE_WINDOW.total_seconds() // 60)} minutes',
            severity=AuditEvent.SEV_CRITICAL, target=username, request=request, actor=None,
            metadata={'failures': recent},
        )


def record_login(user, request, password=None):
    """Log a successful login, flagging a never-seen IP or an off-hours sign-in."""
    if password:
        from .analysis import note_password
        note_password(user, password)
    ip = client_ip(request)
    prior = AuditEvent.objects.filter(event_type='login_success', actor=user)
    new_ip = bool(ip) and prior.exists() and not prior.filter(ip_address=ip).exists()
    start, end = getattr(settings, 'SECURITY_BUSINESS_HOURS', (6, 22))
    hour = timezone.localtime().hour
    off_hours = not (start <= hour < end)

    flags = [f for f, on in (('new IP', new_ip), ('off-hours', off_hours)) if on]
    record(
        'login_success', AuditEvent.CATEGORY_AUTH,
        f'{user.username} signed in' + (f' ({", ".join(flags)})' if flags else ''),
        severity=AuditEvent.SEV_WARNING if flags else AuditEvent.SEV_INFO,
        actor=user, target=user.username, request=request,
        metadata={'new_ip': new_ip, 'off_hours': off_hours}, force=True,
    )


@receiver(user_logged_in)
def _on_session_login(sender, request, user, **kwargs):
    # Only the Django admin uses session login; the API's token login calls
    # record_login itself, so this never double-counts.
    record_login(user, request)


# ── Users, roles, privileges ─────────────────────────────────────────────────

@receiver(pre_save, sender=User)
def _remember_user_flags(sender, instance, raw=False, **kwargs):
    instance._sec_prev = None
    if raw or not instance.pk:
        return
    instance._sec_prev = User.objects.filter(pk=instance.pk).values(
        'is_superuser', 'is_staff', 'is_active').first()


@receiver(post_save, sender=User)
def _on_user_saved(sender, instance, created, raw=False, **kwargs):
    if raw or is_suppressed():
        return
    if created:
        sev = AuditEvent.SEV_CRITICAL if instance.is_superuser else AuditEvent.SEV_INFO
        record('user_created', AuditEvent.CATEGORY_ACCESS,
               f'User {instance.username} created' + (' as superuser' if instance.is_superuser else ''),
               severity=sev, target=instance.username)
        return
    prev = getattr(instance, '_sec_prev', None)
    if not prev:
        return
    changes = [
        ('is_superuser', 'superuser', AuditEvent.SEV_CRITICAL),
        ('is_staff', 'staff (admin site) access', AuditEvent.SEV_WARNING),
    ]
    for field, label, sev in changes:
        before, after = prev[field], getattr(instance, field)
        if before != after:
            record('privilege_granted' if after else 'privilege_revoked', AuditEvent.CATEGORY_ACCESS,
                   f'{label.capitalize()} {"granted to" if after else "revoked from"} {instance.username}',
                   severity=sev if after else AuditEvent.SEV_INFO, target=instance.username,
                   metadata={'field': field})
    if prev['is_active'] != instance.is_active:
        record('user_deactivated' if not instance.is_active else 'user_reactivated',
               AuditEvent.CATEGORY_ACCESS,
               f'User {instance.username} {"deactivated" if not instance.is_active else "reactivated"}',
               target=instance.username)


@receiver(m2m_changed, sender=User.groups.through)
def _on_groups_changed(sender, instance, action, reverse, pk_set, **kwargs):
    if is_suppressed():
        return
    if action == 'pre_clear':
        # pk_set is None on clear; capture membership before it disappears.
        if reverse:
            instance._sec_cleared = list(instance.user_set.values_list('username', flat=True))
        else:
            instance._sec_cleared = list(instance.groups.values_list('name', flat=True))
        return
    if action not in ('post_add', 'post_remove', 'post_clear'):
        return

    added = action == 'post_add'
    if reverse:  # instance is a Group; pk_set holds user ids
        group_names = [instance.name]
        usernames = (getattr(instance, '_sec_cleared', []) if action == 'post_clear'
                     else list(User.objects.filter(pk__in=pk_set).values_list('username', flat=True)))
        pairs = [(u, instance.name) for u in usernames]
    else:        # instance is a User; pk_set holds group ids
        group_names = (getattr(instance, '_sec_cleared', []) if action == 'post_clear'
                       else list(Group.objects.filter(pk__in=pk_set).values_list('name', flat=True)))
        pairs = [(instance.username, g) for g in group_names]

    for username, group in pairs:
        privileged = group in PRIVILEGED_GROUPS
        sev = AuditEvent.SEV_WARNING if (added and privileged) else AuditEvent.SEV_INFO
        record('role_added' if added else 'role_removed', AuditEvent.CATEGORY_ACCESS,
               f'{username} {"added to" if added else "removed from"} {group}',
               severity=sev, target=username, metadata={'group': group})


# ── Kanban share links ───────────────────────────────────────────────────────

@receiver(pre_save, sender=Board)
def _remember_board_sharing(sender, instance, raw=False, **kwargs):
    instance._sec_prev = None
    if not raw and instance.pk:
        instance._sec_prev = Board.objects.filter(pk=instance.pk).values(
            'link_sharing_enabled', 'share_token', 'visibility').first()


@receiver(post_save, sender=Board)
def _on_board_saved(sender, instance, created, raw=False, **kwargs):
    if raw or is_suppressed():
        return
    prev = getattr(instance, '_sec_prev', None) or {
        'link_sharing_enabled': False, 'share_token': None, 'visibility': 'private'}
    name = instance.name
    meta = {'board_id': instance.id}

    if prev['link_sharing_enabled'] != instance.link_sharing_enabled:
        on = instance.link_sharing_enabled
        record('share_link_enabled' if on else 'share_link_disabled', AuditEvent.CATEGORY_EXPOSURE,
               f'Share link {"enabled" if on else "disabled"} on board "{name}"',
               severity=AuditEvent.SEV_WARNING if on else AuditEvent.SEV_INFO,
               target=name, metadata=meta)
    elif (prev['share_token'] and instance.share_token
          and prev['share_token'] != instance.share_token):
        record('share_link_regenerated', AuditEvent.CATEGORY_EXPOSURE,
               f'Share link regenerated on board "{name}" (old link revoked)',
               target=name, metadata=meta)

    if prev['visibility'] != instance.visibility:
        public = instance.visibility == 'public'
        record('board_visibility_changed', AuditEvent.CATEGORY_EXPOSURE,
               f'Board "{name}" made {instance.visibility}',
               severity=AuditEvent.SEV_WARNING if public else AuditEvent.SEV_INFO,
               target=name, metadata=meta)


# ── Team Resources uploads ───────────────────────────────────────────────────

@receiver(post_save, sender=TeamResource)
def _on_upload(sender, instance, created, raw=False, **kwargs):
    if raw or not created or is_suppressed():
        return
    from .analysis import analyze_upload

    result = analyze_upload(instance)
    flags = [f['label'] for f in result['flags']]
    record('file_uploaded', AuditEvent.CATEGORY_EXPOSURE,
           f'Uploaded "{result["name"]}"' + (f' — {"; ".join(flags)}' if flags else ''),
           severity=AuditEvent.SEV_WARNING if flags else AuditEvent.SEV_INFO,
           actor=instance.uploaded_by, target=result['name'],
           metadata={'size': result['size'], 'flags': flags})
