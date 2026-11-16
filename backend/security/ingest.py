"""Applies the ``security`` block of a reporter-agent container report."""
from datetime import timezone as dt_timezone

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .analysis import config_drift
from .audit import record
from .models import AuditEvent, ContainerSecurityReport

MAX_CONFIG_FILES = 500


def _dt(value):
    if not value:
        return None
    dt = parse_datetime(str(value))
    if dt and timezone.is_naive(dt):
        dt = timezone.make_aware(dt, dt_timezone.utc)
    return dt


def _list(value):
    return value if isinstance(value, list) else []


def ingest_container_security(container, data):
    """Upsert posture for ``container``. Only fields present in ``data`` are
    written, mirroring how the container report itself handles partial updates.
    Returns an error string, or None."""
    if not isinstance(data, dict):
        return 'security must be an object'

    report, _ = ContainerSecurityReport.objects.get_or_create(container=container)

    for field in ('privileged', 'runs_as_root'):
        if field in data:
            setattr(report, field, bool(data[field]))
    for field in ('run_user', 'network_mode'):
        if field in data:
            setattr(report, field, str(data[field] or '')[:100])
    for field in ('cap_add', 'mounts', 'published_ports', 'services'):
        if field in data:
            setattr(report, field, _list(data[field]))
    if 'image_created' in data:
        report.image_created = _dt(data['image_created'])

    cve = data.get('cve')
    if isinstance(cve, dict) and isinstance(cve.get('counts'), dict):
        report.cve_counts = {k: int(cve['counts'].get(k) or 0)
                             for k in ('critical', 'high', 'medium', 'low')}
        report.cve_scanner = str(cve.get('scanner') or '')[:50]
        report.scanned_at = _dt(cve.get('scanned_at')) or timezone.now()

    hashes = data.get('config_hashes')
    if isinstance(hashes, dict):
        hashes = {str(k)[:500]: str(v)[:128] for k, v in list(hashes.items())[:MAX_CONFIG_FILES]}
        before = config_drift(report)
        report.config_current = hashes
        if not report.config_baseline:
            # First sighting: whatever is there now is the trusted baseline.
            report.config_baseline = dict(hashes)
            report.baseline_set_at = timezone.now()
        after = config_drift(report)
        changed_set = {k: after[k] for k in ('added', 'removed', 'modified')}
        if after['drifted'] and changed_set != {k: before[k] for k in ('added', 'removed', 'modified')}:
            n = sum(len(v) for v in changed_set.values())
            record('config_drift', AuditEvent.CATEGORY_CONTAINER,
                   f'{n} config file(s) on {container.name} differ from baseline',
                   severity=AuditEvent.SEV_WARNING, target=container.name, actor=None,
                   metadata={'container_id': container.container_id, **changed_set}, force=True)

    report.save()
    return None
