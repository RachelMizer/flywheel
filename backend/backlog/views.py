from django.db import IntegrityError, transaction
from django.db.models import Max
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from kanban.models import Column, Card, CardActivity
from kanban.views import _resolve_role as _kanban_role
from .models import Epic, Sprint, BacklogItem, BacklogActivity


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_manager(user):
    return user.groups.filter(name='manager').exists()


def _epic(epic):
    return {
        'id':          epic.id,
        'project_id':  epic.project_id,
        'title':       epic.title,
        'description': epic.description,
        'created_at':  epic.created_at,
    }


def _sprint(sprint, user, full=False):
    data = {
        'id':          sprint.id,
        'project_id':  sprint.project_id,
        'number':       sprint.number,
        'name':         sprint.name,
        'display_name': f'Sprint {sprint.number}: {sprint.name}' if sprint.name else f'Sprint {sprint.number}',
        'status':      sprint.status,
        'goal':        sprint.goal,
        'start_date':  sprint.start_date,
        'end_date':    sprint.end_date,
        'created_at':  sprint.created_at,
    }
    if full:
        data['items'] = [_item(i, user) for i in sprint.items.select_related('epic', 'kanban_card__column__board')]
    return data


def _item(item, user):
    if item.kanban_card_id:
        status = 'started'
    elif item.sprint_id:
        status = 'planned'
    else:
        status = 'backlog'

    card = item.kanban_card
    kanban_card_data = None
    if card and _kanban_role(user, card.column.board) is not None:
        # Only surface which board/card a story is linked to if the requester can actually view that board
        # (kanban boards can be private, independent of backlog/project visibility).
        kanban_card_data = {
            'id':       card.id,
            'title':    card.title,
            'board_id': card.column.board_id,
        }

    return {
        'id':          item.id,
        'project_id':  item.project_id,
        'title':       item.title,
        'description': item.description,
        'epic':        {'id': item.epic_id, 'title': item.epic.title} if item.epic_id else None,
        'sprint_id':   item.sprint_id,
        'order':       item.order,
        'estimate':    item.estimate,
        'status':      status,
        'kanban_card': kanban_card_data,
        'created_at':  item.created_at,
        'updated_at':  item.updated_at,
    }


def _reindex(project_id, sprint_id):
    """Reindex a scope (that project's project-backlog if sprint_id is None, else that sprint) to contiguous order."""
    items = list(BacklogItem.objects.filter(project_id=project_id, sprint_id=sprint_id).order_by('order', 'id'))
    for i, item in enumerate(items):
        item.order = i
    BacklogItem.objects.bulk_update(items, ['order'])


# ── Epics ─────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def epic_list(request):
    if request.method == 'GET':
        project_id = request.GET.get('project_id')
        if not project_id:
            return Response({'error': 'project_id required'}, status=400)
        return Response([_epic(e) for e in Epic.objects.filter(project_id=project_id).order_by('title')])

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    project_id = request.data.get('project_id')
    title = request.data.get('title', '').strip()
    if not project_id or not title:
        return Response({'error': 'project_id and title required'}, status=400)
    epic = Epic.objects.create(
        project_id=project_id, title=title,
        description=request.data.get('description', ''), created_by=request.user,
    )
    return Response(_epic(epic), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def epic_detail(request, epic_id):
    try:
        epic = Epic.objects.get(pk=epic_id)
    except Epic.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        return Response(_epic(epic))

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    if request.method == 'PATCH':
        title = request.data.get('title', '').strip()
        if title:
            epic.title = title
        if 'description' in request.data:
            epic.description = request.data['description']
        epic.save()
        return Response(_epic(epic))

    epic.delete()
    return Response(status=204)


# ── Sprints ───────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def sprint_list(request):
    if request.method == 'GET':
        project_id = request.GET.get('project_id')
        if not project_id:
            return Response({'error': 'project_id required'}, status=400)
        return Response([_sprint(s, request.user) for s in Sprint.objects.filter(project_id=project_id).order_by('-number')])

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    project_id = request.data.get('project_id')
    if not project_id:
        return Response({'error': 'project_id required'}, status=400)

    for _attempt in range(2):
        next_number = (Sprint.objects.filter(project_id=project_id).aggregate(Max('number'))['number__max'] or 0) + 1
        try:
            sprint = Sprint.objects.create(
                project_id=project_id,
                number=next_number,
                name=request.data.get('name', '').strip(),
                goal=request.data.get('goal', ''),
                start_date=request.data.get('start_date') or None,
                end_date=request.data.get('end_date') or None,
                created_by=request.user,
            )
            break
        except IntegrityError:
            continue
    else:
        return Response({'error': 'Sprint number conflict, please retry.'}, status=400)

    BacklogActivity.objects.create(
        item_title=_sprint(sprint, request.user)['display_name'],
        change='Sprint created',
        changed_by=request.user,
    )
    return Response(_sprint(sprint, request.user), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def sprint_detail(request, sprint_id):
    try:
        sprint = Sprint.objects.get(pk=sprint_id)
    except Sprint.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        return Response(_sprint(sprint, request.user, full=True))

    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    if request.method == 'PATCH':
        if 'name' in request.data:
            sprint.name = request.data['name'].strip()
        if 'goal' in request.data:
            sprint.goal = request.data['goal']
        if 'start_date' in request.data:
            sprint.start_date = request.data['start_date'] or None
        if 'end_date' in request.data:
            sprint.end_date = request.data['end_date'] or None
        if 'status' in request.data:
            new_status = request.data['status']
            if new_status == 'active' and Sprint.objects.filter(
                project_id=sprint.project_id, status='active',
            ).exclude(pk=sprint.pk).exists():
                return Response({'error': 'Another sprint is already active. Complete it before starting a new one.'}, status=400)
            if new_status in dict(Sprint.STATUS_CHOICES):
                sprint.status = new_status
        sprint.save()
        return Response(_sprint(sprint, request.user))

    sprint.delete()
    return Response(status=204)


# ── Backlog Items ─────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def item_list(request):
    if request.method == 'GET':
        project_id = request.GET.get('project_id')
        if not project_id:
            return Response({'error': 'project_id required'}, status=400)
        qs = BacklogItem.objects.filter(project_id=project_id).select_related('epic', 'kanban_card__column__board')
        raw_sprint = request.GET.get('sprint_id')
        if raw_sprint == 'all':
            pass  # no sprint filter — every story in the project, regardless of sprint
        elif raw_sprint in (None, '', 'none'):
            qs = qs.filter(sprint__isnull=True)
        else:
            qs = qs.filter(sprint_id=raw_sprint)
        return Response([_item(i, request.user) for i in qs])

    project_id = request.data.get('project_id')
    title = request.data.get('title', '').strip()
    if not project_id or not title:
        return Response({'error': 'project_id and title required'}, status=400)

    epic_id = request.data.get('epic_id') or None
    if epic_id and not Epic.objects.filter(pk=epic_id, project_id=project_id).exists():
        return Response({'error': 'Epic does not belong to this project.'}, status=400)

    sprint_id = request.data.get('sprint_id') or None
    if sprint_id and not _is_manager(request.user):
        sprint_id = None  # silently ignore if insufficient permission
    if sprint_id and not Sprint.objects.filter(pk=sprint_id, project_id=project_id).exists():
        return Response({'error': 'Sprint does not belong to this project.'}, status=400)

    with transaction.atomic():
        item = BacklogItem.objects.create(
            project_id=project_id,
            title=title,
            description=request.data.get('description', ''),
            epic_id=epic_id,
            sprint_id=sprint_id,
            estimate=request.data.get('estimate') or None,
            order=BacklogItem.objects.filter(project_id=project_id, sprint_id=sprint_id).count(),
            created_by=request.user,
        )
        BacklogActivity.objects.create(item_title=title, change='Story created', changed_by=request.user)

    return Response(_item(item, request.user), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def item_detail(request, item_id):
    try:
        item = BacklogItem.objects.select_related('epic', 'kanban_card__column__board').get(pk=item_id)
    except BacklogItem.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        return Response(_item(item, request.user))

    if request.method == 'PATCH':
        is_manager = _is_manager(request.user)
        title = request.data.get('title', item.title).strip() or item.title
        item.title = title
        if 'description' in request.data:
            item.description = request.data['description']
        if 'epic_id' in request.data:
            epic_id = request.data['epic_id'] or None
            if epic_id and not Epic.objects.filter(pk=epic_id, project_id=item.project_id).exists():
                return Response({'error': 'Epic does not belong to this project.'}, status=400)
            item.epic_id = epic_id
        if 'estimate' in request.data:
            item.estimate = request.data['estimate'] or None

        old_sprint_id = item.sprint_id
        if 'sprint_id' in request.data:
            if is_manager:
                new_sprint_id = request.data['sprint_id'] or None
                if new_sprint_id and not Sprint.objects.filter(pk=new_sprint_id, project_id=item.project_id).exists():
                    return Response({'error': 'Sprint does not belong to this project.'}, status=400)
                if new_sprint_id != old_sprint_id:
                    item.sprint_id = new_sprint_id
                    item.order = BacklogItem.objects.filter(project_id=item.project_id, sprint_id=new_sprint_id).count()
                    BacklogActivity.objects.create(
                        item_title=title,
                        change=(f'Moved to sprint {new_sprint_id}' if new_sprint_id else 'Moved back to project backlog'),
                        changed_by=request.user,
                    )
            # silently ignore if insufficient permission

        item.save()
        if 'sprint_id' in request.data and is_manager and old_sprint_id != item.sprint_id:
            _reindex(item.project_id, old_sprint_id)
            _reindex(item.project_id, item.sprint_id)
        return Response(_item(item, request.user))

    if not request.user.has_perm('backlog.delete_backlogitem'):
        return Response({'error': 'Forbidden'}, status=403)
    project_id, sprint_id = item.project_id, item.sprint_id
    BacklogActivity.objects.create(item_title=item.title, change='Story deleted', changed_by=request.user)
    item.delete()
    _reindex(project_id, sprint_id)
    return Response(status=204)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def item_reorder(request):
    if not _is_manager(request.user):
        return Response({'error': 'Forbidden'}, status=403)

    project_id = request.data.get('project_id')
    scope = request.data.get('scope')
    ordered_ids = request.data.get('ordered_ids', [])
    if not project_id:
        return Response({'error': 'project_id required'}, status=400)
    if not isinstance(ordered_ids, list):
        return Response({'error': 'ordered_ids must be a list'}, status=400)

    with transaction.atomic():
        items = {i.id: i for i in BacklogItem.objects.filter(project_id=project_id, sprint_id=scope)}
        updates = []
        for index, item_id in enumerate(ordered_ids):
            item = items.get(int(item_id))
            if item:
                item.order = index
                updates.append(item)
        BacklogItem.objects.bulk_update(updates, ['order'])

    return Response([
        _item(i, request.user) for i in BacklogItem.objects.filter(project_id=project_id, sprint_id=scope)
            .select_related('epic', 'kanban_card__column__board')
    ])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def item_start(request, item_id):
    try:
        item = BacklogItem.objects.get(pk=item_id)
    except BacklogItem.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if item.sprint_id is None:
        return Response({'error': 'Item must be assigned to a sprint before starting.'}, status=400)
    if item.kanban_card_id is not None:
        return Response({'error': 'Item already started.'}, status=400)

    col_id = request.data.get('column_id')
    if not col_id:
        return Response({'error': 'column_id required'}, status=400)
    try:
        col = Column.objects.select_related('board').get(pk=col_id)
    except Column.DoesNotExist:
        return Response({'error': 'Column not found'}, status=404)

    card = Card.objects.create(
        column=col,
        title=item.title,
        description=item.description,
        order=col.cards.count(),
    )
    CardActivity.objects.create(
        board=col.board,
        card_title=item.title,
        change=f'Created in "{col.name}"',
        changed_by=request.user,
    )
    item.kanban_card = card
    item.save()
    BacklogActivity.objects.create(item_title=item.title, change='Started (linked to Kanban card)', changed_by=request.user)

    return Response(_item(item, request.user))


# ── Dashboard ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def backlog_dashboard(request):
    project_id = request.GET.get('project_id')
    if not project_id:
        return Response({'error': 'project_id required'}, status=400)

    project_backlog_qs = BacklogItem.objects.filter(
        project_id=project_id, sprint__isnull=True,
    ).select_related('epic', 'kanban_card__column__board')
    project_backlog = {
        'count':   project_backlog_qs.count(),
        'preview': [_item(i, request.user) for i in project_backlog_qs[:5]],
    }

    all_sprints = list(Sprint.objects.filter(project_id=project_id).order_by('-number'))
    current_sprint = None
    active = next((s for s in all_sprints if s.status == 'active'), None)
    if active:
        current_sprint = active
    else:
        planned = [s for s in all_sprints if s.status == 'planned']
        if planned:
            current_sprint = max(planned, key=lambda s: s.number)
        elif all_sprints:
            current_sprint = max(all_sprints, key=lambda s: s.created_at)

    current_sprint_data = None
    if current_sprint:
        preview_qs = BacklogItem.objects.filter(sprint=current_sprint).select_related('epic', 'kanban_card__column__board')[:5]
        current_sprint_data = _sprint(current_sprint, request.user)
        current_sprint_data['preview'] = [_item(i, request.user) for i in preview_qs]
        current_sprint_data['item_count'] = BacklogItem.objects.filter(sprint=current_sprint).count()

    return Response({
        'project_backlog': project_backlog,
        'sprints':          [_sprint(s, request.user) for s in all_sprints],
        'current_sprint':   current_sprint_data,
    })
