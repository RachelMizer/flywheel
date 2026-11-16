from collections import defaultdict
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from docker_manager.models import ContainerRecord
from kanban.models import Board
from team_resources.models import TeamResource

from .analysis import (SEVERITY_ORDER, analyze_upload, config_drift, container_findings,
                       posture_checks, posture_score, users_with_weak_passwords)
from .audit import record
from .models import AuditEvent
from .signals import BRUTE_FORCE_THRESHOLD

SECURITY_GROUPS = ('manager', 'support-admin')
TOKEN_STALE_DAYS = 30
TOKEN_MAX_AGE_DAYS = 90
SHARE_LINK_STALE_DAYS = 30


class CanViewSecurity(BasePermission):
    message = 'Security monitoring is limited to managers and support admins.'

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and
                    (u.is_superuser or u.groups.filter(name__in=SECURITY_GROUPS).exists()))


PERMS = [IsAuthenticated, CanViewSecurity]


def _user_brief(user):
    if not user:
        return None
    name = f'{user.first_name} {user.last_name}'.strip() or user.username
    return {'id': user.id, 'username': user.username, 'full_name': name}


def _event(e):
    return {
        'id': e.id, 'type': e.event_type, 'category': e.category, 'severity': e.severity,
        'actor': _user_brief(e.actor), 'target': e.target, 'ip': e.ip_address,
        'user_agent': e.user_agent, 'message': e.message, 'metadata': e.metadata,
        'created_at': e.created_at,
    }


# ── Collectors shared by overview and the per-tab endpoints ─────────────────

def _brute_force(since):
    """Usernames with >= threshold failed logins since ``since``."""
    rows = defaultdict(lambda: {'count': 0, 'ips': set(), 'last': None, 'unknown_user': False})
    for e in AuditEvent.objects.filter(event_type='login_failed', created_at__gte=since):
        r = rows[e.target]
        r['count'] += 1
        if e.ip_address:
            r['ips'].add(e.ip_address)
        r['last'] = max(r['last'], e.created_at) if r['last'] else e.created_at
        r['unknown_user'] = r['unknown_user'] or e.metadata.get('unknown_user', False)
    out = [{'username': u, 'count': r['count'], 'ips': sorted(r['ips']), 'last': r['last'],
            'unknown_user': r['unknown_user'], 'suspected': r['count'] >= BRUTE_FORCE_THRESHOLD}
           for u, r in rows.items()]
    return sorted(out, key=lambda r: -r['count'])


def _tokens():
    now = timezone.now()
    out = []
    for t in Token.objects.select_related('user', 'usage').prefetch_related('user__groups'):
        usage = getattr(t, 'usage', None)
        last = usage.last_used_at if usage else None
        age_days = (now - t.created).days
        idle_days = (now - (last or t.created)).days
        reasons = []
        if idle_days >= TOKEN_STALE_DAYS:
            reasons.append(f'unused {idle_days}d')
        if age_days >= TOKEN_MAX_AGE_DAYS:
            reasons.append(f'{age_days}d old')
        out.append({
            'user': _user_brief(t.user),
            'groups': [g.name for g in t.user.groups.all()],
            'is_superuser': t.user.is_superuser,
            'created': t.created, 'age_days': age_days,
            'last_used_at': last, 'last_ip': usage.last_ip if usage else None,
            'stale': bool(reasons), 'stale_reasons': reasons,
        })
    return sorted(out, key=lambda r: (not r['stale'], -r['age_days']))


def _share_links():
    now = timezone.now()
    enabled_events = {}
    for e in AuditEvent.objects.filter(event_type='share_link_enabled').order_by('created_at'):
        enabled_events[e.metadata.get('board_id')] = e  # latest wins
    out = []
    boards = (Board.objects.filter(link_sharing_enabled=True)
              .select_related('owner').prefetch_related('memberships'))
    for b in boards:
        ev = enabled_events.get(b.id)
        since = ev.created_at if ev else b.created_at
        age = (now - since).days
        roles = [m.role for m in b.memberships.all()]
        out.append({
            'id': b.id, 'name': b.name, 'owner': _user_brief(b.owner), 'visibility': b.visibility,
            'enabled_at': since, 'enabled_by': _user_brief(ev.actor) if ev else None,
            'enabled_at_known': ev is not None, 'age_days': age,
            'stale': age >= SHARE_LINK_STALE_DAYS,
            'members': len(roles), 'editors': roles.count('edit'),
        })
    return sorted(out, key=lambda r: -r['age_days'])


def _uploads():
    out = []
    for r in TeamResource.objects.select_related('uploaded_by'):
        a = analyze_upload(r)
        out.append({
            'id': r.id, 'name': a['name'], 'size': a['size'], 'flags': a['flags'],
            'severity': a['severity'], 'uploaded_by': _user_brief(r.uploaded_by),
            'uploaded_at': r.uploaded_at, 'archived': r.archived_at is not None,
        })
    return sorted(out, key=lambda r: (SEVERITY_ORDER.get(r['severity'], 9), r['name'].lower()))


def _containers():
    out = []
    for c in ContainerRecord.objects.select_related('security'):
        report = getattr(c, 'security', None)
        findings = container_findings(c, report)
        entry = {
            'id': c.id, 'container_id': c.container_id, 'name': c.name,
            'namespace': c.namespace or 'default', 'image': c.image, 'status': c.status,
            'findings': findings, 'posture': None,
        }
        if report:
            entry['posture'] = {
                'privileged': report.privileged, 'run_user': report.run_user,
                'runs_as_root': report.runs_as_root, 'network_mode': report.network_mode,
                'cap_add': report.cap_add, 'mounts': report.mounts,
                'published_ports': report.published_ports, 'services': report.services,
                'image_created': report.image_created, 'cve_counts': report.cve_counts,
                'cve_scanner': report.cve_scanner, 'scanned_at': report.scanned_at,
                'config_files': len(report.config_current or {}),
                'drift': config_drift(report), 'baseline_set_at': report.baseline_set_at,
                'baseline_set_by': _user_brief(report.baseline_set_by),
                'updated_at': report.updated_at,
            }
        out.append(entry)

    def worst(e):
        return min((SEVERITY_ORDER[f['severity']] for f in e['findings']), default=9)
    return sorted(out, key=lambda e: (worst(e), e['namespace'], e['name']))


def _count_by_severity(items, key='severity'):
    counts = defaultdict(int)
    for it in items:
        if it.get(key):
            counts[it[key]] += 1
    return counts


# ── Endpoints ────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes(PERMS)
def overview(request):
    now = timezone.now()
    day_ago = now - timedelta(days=1)

    tokens = _tokens()
    links = _share_links()
    uploads = _uploads()
    containers = _containers()
    brute = [b for b in _brute_force(day_ago) if b['suspected']]
    upload_counts = _count_by_severity(uploads)
    finding_counts = _count_by_severity([f for c in containers for f in c['findings']])

    context = {
        'weak_password_users': users_with_weak_passwords(),
        'stale_tokens': sum(t['stale'] for t in tokens),
        'token_stale_days': TOKEN_STALE_DAYS, 'token_max_age_days': TOKEN_MAX_AGE_DAYS,
        'active_share_links': len(links),
        'old_share_links': sum(l['stale'] for l in links),
        'share_link_stale_days': SHARE_LINK_STALE_DAYS,
        'brute_force_24h': len(brute),
        'risky_uploads': {'critical': upload_counts['critical'], 'high': upload_counts['high']},
        'container_findings': {'critical': finding_counts['critical'], 'high': finding_counts['high']},
    }
    checks = posture_checks(context)
    events_24h = AuditEvent.objects.filter(created_at__gte=day_ago)
    recent_alerts = AuditEvent.objects.filter(severity__in=['warning', 'critical']).select_related('actor')[:8]

    return Response({
        'score': posture_score(checks),
        'checks': checks,
        'summary': {
            'failed_logins_24h': events_24h.filter(event_type='login_failed').count(),
            'logins_24h': events_24h.filter(event_type='login_success').count(),
            'brute_force_24h': len(brute),
            'critical_events_24h': events_24h.filter(severity='critical').count(),
            'active_tokens': len(tokens),
            'stale_tokens': context['stale_tokens'],
            'active_share_links': len(links),
            'flagged_uploads': sum(1 for u in uploads if u['severity'] in ('critical', 'high', 'medium')),
            'container_findings': dict(finding_counts),
            'containers_without_posture': sum(1 for c in containers if c['posture'] is None),
        },
        'recent_alerts': [_event(e) for e in recent_alerts],
        'generated_at': now,
    })


@api_view(['GET'])
@permission_classes(PERMS)
def event_list(request):
    qs = AuditEvent.objects.select_related('actor')
    p = request.query_params
    if p.get('category'):
        qs = qs.filter(category__in=p['category'].split(','))
    if p.get('severity'):
        qs = qs.filter(severity__in=p['severity'].split(','))
    if p.get('type'):
        qs = qs.filter(event_type__in=p['type'].split(','))
    if p.get('q'):
        q = p['q'].strip()
        qs = qs.filter(Q(message__icontains=q) | Q(target__icontains=q) |
                       Q(actor__username__icontains=q) | Q(ip_address__icontains=q))
    try:
        days = int(p.get('days') or 0)
    except ValueError:
        days = 0
    if days > 0:
        qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=days))
    try:
        limit = max(1, min(int(p.get('limit') or 200), 1000))
    except ValueError:
        limit = 200
    return Response({'count': qs.count(), 'results': [_event(e) for e in qs[:limit]]})


@api_view(['GET'])
@permission_classes(PERMS)
def auth_activity(request):
    week_ago = timezone.now() - timedelta(days=7)
    access_changes = (AuditEvent.objects.filter(category=AuditEvent.CATEGORY_ACCESS)
                      .select_related('actor')[:50])
    return Response({
        'failed_logins': _brute_force(week_ago),
        'brute_force_threshold': BRUTE_FORCE_THRESHOLD,
        'tokens': _tokens(),
        'token_stale_days': TOKEN_STALE_DAYS,
        'token_max_age_days': TOKEN_MAX_AGE_DAYS,
        'access_changes': [_event(e) for e in access_changes],
    })


@api_view(['POST'])
@permission_classes(PERMS)
def token_revoke(request, user_id):
    if user_id == request.user.id:
        return Response({'error': 'Use Sign Out to end your own session.'}, status=400)
    token = Token.objects.select_related('user').filter(user_id=user_id).first()
    if not token:
        return Response({'error': 'No active token for that user.'}, status=404)
    username = token.user.username
    token.delete()
    record('token_revoked', AuditEvent.CATEGORY_AUTH, f'API token for {username} revoked',
           severity=AuditEvent.SEV_WARNING, actor=request.user, target=username, request=request)
    return Response(status=204)


@api_view(['GET'])
@permission_classes(PERMS)
def exposure(request):
    return Response({
        'share_links': _share_links(),
        'share_link_stale_days': SHARE_LINK_STALE_DAYS,
        'uploads': _uploads(),
    })


@api_view(['GET'])
@permission_classes(PERMS)
def container_posture(request):
    return Response(_containers())


@api_view(['POST'])
@permission_classes(PERMS)
def accept_baseline(request, container_pk):
    c = ContainerRecord.objects.select_related('security').filter(pk=container_pk).first()
    report = getattr(c, 'security', None) if c else None
    if not report:
        return Response({'error': 'No security report for that container.'}, status=404)
    drift = config_drift(report)
    report.config_baseline = dict(report.config_current or {})
    report.baseline_set_at = timezone.now()
    report.baseline_set_by = request.user
    report.save(update_fields=['config_baseline', 'baseline_set_at', 'baseline_set_by', 'updated_at'])
    record('config_baseline_accepted', AuditEvent.CATEGORY_CONTAINER,
           f'Config baseline accepted for {c.name}', actor=request.user, target=c.name,
           request=request, metadata={'container_id': c.container_id,
                                      **{k: drift[k] for k in ('added', 'removed', 'modified')}})
    return Response(status=204)
