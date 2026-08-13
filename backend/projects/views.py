from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from backlog.models import Epic, Sprint, BacklogItem
from .models import Project, ProjectDocument, TimelineEvent

User = get_user_model()

ALLOWED_DOC_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'markdown', 'png', 'jpg', 'jpeg'}
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg'}
MAX_DOC_SIZE = 20 * 1024 * 1024  # 20MB

ALLOWED_ICON_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'}
MAX_ICON_SIZE = 5 * 1024 * 1024  # 5MB


def _validate_upload(file, allowed_extensions, max_size, image_extensions=()):
    """Shared extension/size/decode validation for an uploaded file. Returns an error string, or None if valid.
    `image_extensions` (a subset of `allowed_extensions`, or 'svg') are Pillow-decode-verified; SVG is trusted
    on extension+size alone since Pillow can't reliably validate it."""
    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else ''
    if ext not in allowed_extensions:
        return f'File type ".{ext}" is not allowed.'
    if file.size > max_size:
        return f'File exceeds the {max_size // (1024 * 1024)}MB size limit.'
    if ext in image_extensions and ext != 'svg':
        try:
            from PIL import Image
            file.seek(0)
            Image.open(file).verify()
        except Exception:
            return 'Invalid image file.'
        finally:
            file.seek(0)
    return None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_manager(user):
    return user.groups.filter(name='manager').exists()


def _user_brief(user):
    if not user:
        return None
    name = f'{user.first_name} {user.last_name}'.strip() or user.username
    return {'id': user.id, 'username': user.username, 'full_name': name}


def _set_single_role(project, field, value):
    """Assign a single-person scrum role (scrum_master / product_owner) FK from a
    user id. Falsy value clears it. Returns an error string, or None on success."""
    if value in (None, '', 0, '0'):
        setattr(project, f'{field}_id', None)
        return None
    try:
        uid = int(value)
    except (TypeError, ValueError):
        return f'Invalid user id {value!r}.'
    if not User.objects.filter(pk=uid).exists():
        return f'User {uid} not found.'
    setattr(project, f'{field}_id', uid)
    return None


def _project(project, full=False):
    data = {
        'id':          project.id,
        'title':       project.title,
        'description': project.description,
        'start_date':  project.start_date,
        'end_date':    project.end_date,
        'icon_url':    project.icon.url if project.icon else None,
        'created_at':  project.created_at,
    }
    if full:
        data['has_backlog'] = (
            Epic.objects.filter(project=project).exists()
            or Sprint.objects.filter(project=project).exists()
            or BacklogItem.objects.filter(project=project).exists()
        )
        data['has_timeline'] = TimelineEvent.objects.filter(project=project).exists()
        data['scrum_master'] = _user_brief(project.scrum_master)
        data['product_owner'] = _user_brief(project.product_owner)
        data['developers'] = [
            _user_brief(u) for u in project.developers.order_by('first_name', 'username')
        ]
    return data


def _document(doc):
    return {
        'id':          doc.id,
        'name':        doc.file.name.rsplit('/', 1)[-1],
        'url':         doc.file.url,
        'uploaded_by': _user_brief(doc.uploaded_by),
        'uploaded_at': doc.uploaded_at,
    }


def _compute_active_id(project_id):
    today = timezone.localdate()
    past_or_today = list(TimelineEvent.objects.filter(project_id=project_id, date__lte=today))
    if not past_or_today:
        return None
    return max(past_or_today, key=lambda e: (e.date, e.id)).id


def _timeline_event(event, active_id):
    return {
        'id':          event.id,
        'project_id':  event.project_id,
        'title':       event.title,
        'description': event.description,
        'date':        event.date,
        'epic':        {'id': event.epic_id, 'title': event.epic.title} if event.epic_id else None,
        'story':       {'id': event.story_id, 'title': event.story.title} if event.story_id else None,
        'owner':       _user_brief(event.owner),
        'is_active':   event.id == active_id,
        'created_at':  event.created_at,
    }


# ── Projects ──────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def project_list(request):
    if request.method == 'GET':
        return Response([_project(p) for p in Project.objects.order_by('-created_at')])

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    title = request.data.get('title', '').strip()
    if not title:
        return Response({'error': 'Title required'}, status=400)
    project = Project.objects.create(
        title=title,
        description=request.data.get('description', ''),
        start_date=request.data.get('start_date') or None,
        end_date=request.data.get('end_date') or None,
        created_by=request.user,
    )
    return Response(_project(project), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def project_detail(request, project_id):
    try:
        project = Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        return Response(_project(project, full=True))

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    if request.method == 'PATCH':
        title = request.data.get('title', '').strip()
        if title:
            project.title = title
        if 'description' in request.data:
            project.description = request.data['description']
        if 'start_date' in request.data:
            project.start_date = request.data['start_date'] or None
        if 'end_date' in request.data:
            project.end_date = request.data['end_date'] or None
        if 'icon' in request.FILES:
            icon = request.FILES['icon']
            error = _validate_upload(icon, ALLOWED_ICON_EXTENSIONS, MAX_ICON_SIZE, image_extensions=ALLOWED_ICON_EXTENSIONS)
            if error:
                return Response({'error': error}, status=400)
            if project.icon:
                project.icon.delete(save=False)
            project.icon = icon
        # Scrum role assignment (single-person roles are FKs; the dev team is M2M).
        for role_field, key in (('scrum_master', 'scrum_master_id'),
                                 ('product_owner', 'product_owner_id')):
            if key in request.data:
                error = _set_single_role(project, role_field, request.data[key])
                if error:
                    return Response({'error': error}, status=400)
        project.save()
        if 'developer_ids' in request.data:
            ids = request.data['developer_ids'] or []
            if not isinstance(ids, list):
                return Response({'error': 'developer_ids must be a list.'}, status=400)
            users = list(User.objects.filter(id__in=ids))
            if len(users) != len(set(ids)):
                return Response({'error': 'One or more developer ids are invalid.'}, status=400)
            project.developers.set(users)
        return Response(_project(project, full=True))

    project.delete()
    return Response(status=204)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def member_list(request):
    """All assignable users, for the scrum-role pickers."""
    users = User.objects.filter(is_active=True).order_by('first_name', 'last_name', 'username')
    return Response([_user_brief(u) for u in users])


# ── Documents ─────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def document_list(request, project_id):
    try:
        project = Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        return Response([_document(d) for d in project.documents.select_related('uploaded_by').order_by('-uploaded_at')])

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'file required'}, status=400)

    error = _validate_upload(file, ALLOWED_DOC_EXTENSIONS, MAX_DOC_SIZE, image_extensions=ALLOWED_IMAGE_EXTENSIONS)
    if error:
        return Response({'error': error}, status=400)

    doc = ProjectDocument.objects.create(project=project, file=file, uploaded_by=request.user)
    return Response(_document(doc), status=201)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def document_detail(request, doc_id):
    try:
        doc = ProjectDocument.objects.get(pk=doc_id)
    except ProjectDocument.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    doc.delete()  # post_delete signal on ProjectDocument cleans up the file on disk
    return Response(status=204)


# ── Timeline ──────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def timeline_event_list(request, project_id):
    try:
        project = Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        active_id = _compute_active_id(project_id)
        events = project.timeline_events.select_related('epic', 'story', 'owner')
        return Response([_timeline_event(e, active_id) for e in events])

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    title = request.data.get('title', '').strip()
    date = request.data.get('date')
    if not title or not date:
        return Response({'error': 'title and date required'}, status=400)

    epic_id = request.data.get('epic_id') or None
    if epic_id and not Epic.objects.filter(pk=epic_id, project_id=project_id).exists():
        return Response({'error': 'Epic does not belong to this project.'}, status=400)

    story_id = request.data.get('story_id') or None
    if story_id and not BacklogItem.objects.filter(pk=story_id, project_id=project_id).exists():
        return Response({'error': 'Story does not belong to this project.'}, status=400)

    event = TimelineEvent.objects.create(
        project=project,
        title=title,
        description=request.data.get('description', ''),
        date=date,
        epic_id=epic_id,
        story_id=story_id,
        owner_id=request.data.get('owner_id') or None,
        created_by=request.user,
    )
    active_id = _compute_active_id(project_id)
    return Response(_timeline_event(event, active_id), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def timeline_event_detail(request, event_id):
    try:
        event = TimelineEvent.objects.select_related('epic', 'story', 'owner').get(pk=event_id)
    except TimelineEvent.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        active_id = _compute_active_id(event.project_id)
        return Response(_timeline_event(event, active_id))

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    if request.method == 'PATCH':
        title = request.data.get('title', '').strip()
        if title:
            event.title = title
        if 'description' in request.data:
            event.description = request.data['description']
        if 'date' in request.data and request.data['date']:
            event.date = request.data['date']
        if 'epic_id' in request.data:
            epic_id = request.data['epic_id'] or None
            if epic_id and not Epic.objects.filter(pk=epic_id, project_id=event.project_id).exists():
                return Response({'error': 'Epic does not belong to this project.'}, status=400)
            event.epic_id = epic_id
        if 'story_id' in request.data:
            story_id = request.data['story_id'] or None
            if story_id and not BacklogItem.objects.filter(pk=story_id, project_id=event.project_id).exists():
                return Response({'error': 'Story does not belong to this project.'}, status=400)
            event.story_id = story_id
        if 'owner_id' in request.data:
            event.owner_id = request.data['owner_id'] or None
        event.save()
        active_id = _compute_active_id(event.project_id)
        return Response(_timeline_event(event, active_id))

    event.delete()
    return Response(status=204)
