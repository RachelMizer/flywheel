from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ContainerRecord

VALID_STATUSES = {c[0] for c in ContainerRecord.STATUS_CHOICES}


def _serialize(c):
    return {
        'id':        c.id,
        'container_id': c.container_id,
        'name':      c.name,
        'cluster':   c.cluster or c.name,
        'image':     c.image,
        'status':    c.status,
        'notes':     c.notes,
        'last_seen': c.last_seen,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def container_list(request):
    containers = ContainerRecord.objects.all()
    return Response([_serialize(c) for c in containers])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_containers(request):
    """Ingest endpoint for the local reporter agent.

    Accepts a single container object or a list of them and upserts each by
    ``container_id`` — the primary key a real Docker host would report. This is
    what makes the monitoring "live" against a local FlyWheel: the agent POSTs
    the current daemon state on a loop, and each POST refreshes ``last_seen``
    (auto_now) so the UI can tell a fresh heartbeat from a stale one.

    The public Render deploy has no Docker daemon and nothing reachable to
    report to it, so in production this endpoint simply goes unused and the
    seeded demo rows stand in.
    """
    payload = request.data
    items = payload if isinstance(payload, list) else [payload]

    updated = []
    errors = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append({'index': i, 'error': 'each item must be an object'})
            continue
        container_id = (item.get('container_id') or '').strip()
        if not container_id:
            errors.append({'index': i, 'error': 'container_id is required'})
            continue

        status = item.get('status', ContainerRecord.STATUS_HEALTHY)
        if status not in VALID_STATUSES:
            errors.append({'index': i, 'error': f'invalid status {status!r}'})
            continue

        # Only write fields the caller actually sent, so a partial report (e.g.
        # a heartbeat carrying just status) doesn't blank out name/image/cluster
        # set by a fuller earlier report. status always has a sensible default.
        defaults = {f: item[f] for f in ('name', 'cluster', 'image', 'notes')
                    if f in item}
        defaults['status'] = status
        # On first sight of a container that reported no name, fall back to its
        # id so the row is never nameless; never overwrite an existing name.
        if 'name' not in defaults and \
                not ContainerRecord.objects.filter(container_id=container_id).exists():
            defaults['name'] = container_id

        obj, created = ContainerRecord.objects.update_or_create(
            container_id=container_id, defaults=defaults,
        )
        # last_seen is auto_now, so update_or_create already refreshed it; touch
        # it explicitly for the create-with-no-changed-defaults edge case.
        obj.last_seen = timezone.now()
        obj.save(update_fields=['last_seen'])
        updated.append({'container_id': container_id, 'created': created})

    resp = {'updated': updated}
    if errors:
        resp['errors'] = errors
    return Response(resp, status=207 if errors else 200)
