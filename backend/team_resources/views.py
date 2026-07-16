from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import TeamResource

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'markdown', 'png', 'jpg', 'jpeg'}
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg'}
MAX_SIZE = 20 * 1024 * 1024  # 20MB

ARCHIVE_RETENTION_DAYS = 60


def _validate_upload(file):
    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else ''
    if ext not in ALLOWED_EXTENSIONS:
        return f'File type ".{ext}" is not allowed.'
    if file.size > MAX_SIZE:
        return f'File exceeds the {MAX_SIZE // (1024 * 1024)}MB size limit.'
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        try:
            from PIL import Image
            file.seek(0)
            Image.open(file).verify()
        except Exception:
            return 'Invalid image file.'
        finally:
            file.seek(0)
    return None


def _is_manager(user):
    return user.groups.filter(name='manager').exists()


def _user_brief(user):
    if not user:
        return None
    name = f'{user.first_name} {user.last_name}'.strip() or user.username
    return {'id': user.id, 'username': user.username, 'full_name': name}


def _purge_expired():
    """Hard-delete any archived resource past its 60-day retention window.
    No background task runner in this app, so this runs opportunistically
    whenever the list or archive endpoints are hit rather than on a schedule."""
    cutoff = timezone.now() - timedelta(days=ARCHIVE_RETENTION_DAYS)
    TeamResource.objects.filter(archived_at__isnull=False, archived_at__lt=cutoff).delete()


def _resource(r):
    data = {
        'id':          r.id,
        'name':        r.file.name.rsplit('/', 1)[-1],
        'url':         r.file.url,
        'uploaded_by': _user_brief(r.uploaded_by),
        'uploaded_at': r.uploaded_at,
    }
    if r.archived_at:
        data['archived_at'] = r.archived_at
        data['purge_at'] = r.archived_at + timedelta(days=ARCHIVE_RETENTION_DAYS)
    return data


# ── Active documents ─────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def resource_list(request):
    _purge_expired()

    if request.method == 'GET':
        resources = TeamResource.objects.filter(archived_at__isnull=True).select_related('uploaded_by')
        return Response([_resource(r) for r in resources])

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'file required'}, status=400)

    error = _validate_upload(file)
    if error:
        return Response({'error': error}, status=400)

    resource = TeamResource.objects.create(file=file, uploaded_by=request.user)
    return Response(_resource(resource), status=201)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def resource_detail(request, resource_id):
    """Soft-delete: moves the document to the archive rather than removing it immediately."""
    try:
        resource = TeamResource.objects.get(pk=resource_id, archived_at__isnull=True)
    except TeamResource.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    resource.archived_at = timezone.now()
    resource.save(update_fields=['archived_at'])
    return Response(status=204)


# ── Archive (manager-only) ───────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def archive_list(request):
    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    _purge_expired()
    resources = TeamResource.objects.filter(archived_at__isnull=False).select_related('uploaded_by').order_by('-archived_at')
    return Response([_resource(r) for r in resources])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def resource_restore(request, resource_id):
    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    try:
        resource = TeamResource.objects.get(pk=resource_id, archived_at__isnull=False)
    except TeamResource.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    resource.archived_at = None
    resource.save(update_fields=['archived_at'])
    return Response(_resource(resource))


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def resource_purge(request, resource_id):
    """Permanently delete an archived document immediately, without waiting out the retention window."""
    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    try:
        resource = TeamResource.objects.get(pk=resource_id, archived_at__isnull=False)
    except TeamResource.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    resource.delete()  # post_delete signal cleans up the file on disk
    return Response(status=204)
