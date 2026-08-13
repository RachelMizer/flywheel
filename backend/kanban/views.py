import secrets

from django.db.models import Prefetch, Q
from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Board, BoardMembership, Column, Card, Checklist, ChecklistItem, CardActivity


# ── Permissions ───────────────────────────────────────────────────────────────

def _resolve_role(user, board):
    """Returns 'owner' | 'edit' | 'view' | None (no access) for this user on this board."""
    if board.owner_id == user.id:
        return 'owner'
    # Managers have an org-wide edit override: they can open and edit any board,
    # matching the delete power they already have in _can_delete. Owner-only
    # actions — changing visibility/link-sharing, managing members, regenerating
    # the share link — stay gated on 'owner' in their own endpoints, so this does
    # not hand those to managers; it only unlocks card/column/rename editing.
    if _is_manager(user):
        return 'edit'
    membership = BoardMembership.objects.filter(board=board, user=user).first()
    if membership:
        return membership.role
    if board.visibility == 'public':
        return 'view'
    return None


def _visible_boards(user):
    # Managers see every board (consistent with their edit/delete override above).
    if _is_manager(user):
        return Board.objects.all()
    return Board.objects.filter(
        Q(owner=user) | Q(visibility='public') | Q(memberships__user=user)
    ).distinct()


def _generate_share_token():
    return secrets.token_urlsafe(24)


def _is_manager(user):
    return user.groups.filter(name='manager').exists()


def _can_delete(user, board):
    """Deleting a board or a card on it: the board's owner, or an org-wide manager — not a plain editor."""
    return board.owner_id == user.id or _is_manager(user)


# ── Serializers ───────────────────────────────────────────────────────────────

def _user_brief(user):
    if not user:
        return None
    name = f'{user.first_name} {user.last_name}'.strip() or user.username
    return {'id': user.id, 'username': user.username, 'full_name': name}


def _item(item):
    return {'id': item.id, 'text': item.text, 'checked': item.checked, 'order': item.order}


def _checklist(cl):
    return {
        'id':    cl.id,
        'name':  cl.name,
        'order': cl.order,
        'items': [_item(i) for i in cl.items.all()],
    }


def _card(card, full=False):
    # Checklist summary — works with prefetched data (no extra queries)
    all_items = [i for cl in card.checklists.all() for i in cl.items.all()]
    data = {
        'id':              card.id,
        'title':           card.title,
        'description':     card.description,
        'order':           card.order,
        'assigned_to':     _user_brief(card.assigned_to) if card.assigned_to else None,
        'checklist_total': len(all_items),
        'checklist_done':  sum(1 for i in all_items if i.checked),
        'created_at':      card.created_at,
        'updated_at':      card.updated_at,
    }
    if full:
        data['checklists'] = [_checklist(cl) for cl in card.checklists.all()]
    return data


def _column(col):
    return {
        'id':    col.id,
        'name':  col.name,
        'order': col.order,
        'cards': [_card(c) for c in col.cards.all()],
    }


def _board(board, full=False, role=None):
    data = {
        'id':                    board.id,
        'name':                  board.name,
        'owner':                 _user_brief(board.owner),
        'visibility':            board.visibility,
        'link_sharing_enabled':  board.link_sharing_enabled,
        'my_role':               role,
        'created_at':            board.created_at,
    }
    if role is not None:
        # "Who has access" is visible to anyone who can already view the board (not a secret);
        # the share link itself (share_token) stays owner-only below.
        data['members'] = [
            {'id': m.id, 'user': _user_brief(m.user), 'role': m.role}
            for m in board.memberships.select_related('user').order_by('user__first_name', 'user__username')
        ]
    if role == 'owner':
        data['share_token'] = board.share_token
    if full:
        # Prefetch everything so _card summary uses cached data
        cols = board.columns.prefetch_related(
            Prefetch('cards', queryset=Card.objects.select_related('assigned_to').prefetch_related(
                Prefetch('checklists', queryset=Checklist.objects.prefetch_related('items'))
            ))
        ).all()
        data['columns'] = [_column(c) for c in cols]
    return data


# ── Boards ────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def board_list(request):
    if request.method == 'GET':
        boards = _visible_boards(request.user).order_by('created_at')
        return Response([_board(b, role=_resolve_role(request.user, b)) for b in boards])

    name = request.data.get('name', '').strip()
    if not name:
        return Response({'error': 'Name required'}, status=400)
    visibility = request.data.get('visibility', 'private')
    if visibility not in dict(Board.VISIBILITY_CHOICES):
        visibility = 'private'
    board = Board.objects.create(name=name, owner=request.user, visibility=visibility)
    return Response(_board(board, role='owner'), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def board_detail(request, board_id):
    try:
        board = Board.objects.get(pk=board_id)
    except Board.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    role = _resolve_role(request.user, board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        return Response(_board(board, full=True, role=role))

    if request.method == 'PATCH':
        if role not in ('owner', 'edit'):
            return Response({'error': 'Forbidden'}, status=403)

        name = request.data.get('name', '').strip()
        if name:
            board.name = name

        if 'visibility' in request.data or 'link_sharing_enabled' in request.data:
            if role != 'owner':
                return Response({'error': 'Forbidden'}, status=403)
            if 'visibility' in request.data:
                new_visibility = request.data['visibility']
                if new_visibility in dict(Board.VISIBILITY_CHOICES):
                    board.visibility = new_visibility
            if 'link_sharing_enabled' in request.data:
                board.link_sharing_enabled = bool(request.data['link_sharing_enabled'])
                if board.link_sharing_enabled and not board.share_token:
                    board.share_token = _generate_share_token()

        board.save()
        return Response(_board(board, role=role))

    if not _can_delete(request.user, board):
        return Response({'error': 'Forbidden'}, status=403)
    board.delete()
    return Response(status=204)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def board_regenerate_link(request, board_id):
    try:
        board = Board.objects.get(pk=board_id)
    except Board.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if _resolve_role(request.user, board) != 'owner':
        return Response({'error': 'Forbidden'}, status=403)

    board.share_token = _generate_share_token()
    board.save()
    return Response({'share_token': board.share_token})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def board_shared_detail(request, token):
    try:
        board = Board.objects.get(share_token=token, link_sharing_enabled=True)
    except Board.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    role = _resolve_role(request.user, board) or 'view'
    return Response(_board(board, full=True, role=role))


# ── Board Members ─────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def board_member_create(request, board_id):
    try:
        board = Board.objects.get(pk=board_id)
    except Board.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if _resolve_role(request.user, board) != 'owner':
        return Response({'error': 'Forbidden'}, status=403)

    user_id = request.data.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)
    if int(user_id) == board.owner_id:
        return Response({'error': 'The owner already has full access.'}, status=400)

    role = request.data.get('role', 'view')
    if role not in dict(BoardMembership.ROLE_CHOICES):
        role = 'view'

    try:
        target_user = User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    membership, created = BoardMembership.objects.get_or_create(
        board=board, user=target_user, defaults={'role': role, 'invited_by': request.user},
    )
    if not created:
        return Response({'error': 'User is already a member of this board.'}, status=400)

    return Response({'id': membership.id, 'user': _user_brief(membership.user), 'role': membership.role}, status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def board_member_detail(request, membership_id):
    try:
        membership = BoardMembership.objects.select_related('board', 'user').get(pk=membership_id)
    except BoardMembership.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    if _resolve_role(request.user, membership.board) != 'owner':
        return Response({'error': 'Forbidden'}, status=403)

    if request.method == 'PATCH':
        new_role = request.data.get('role')
        if new_role in dict(BoardMembership.ROLE_CHOICES):
            membership.role = new_role
            membership.save()
        return Response({'id': membership.id, 'user': _user_brief(membership.user), 'role': membership.role})

    membership.delete()
    return Response(status=204)


# ── Columns ───────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def column_create(request):
    board_id = request.data.get('board_id')
    name = request.data.get('name', '').strip()
    if not board_id or not name:
        return Response({'error': 'board_id and name required'}, status=400)
    try:
        board = Board.objects.get(pk=board_id)
    except Board.DoesNotExist:
        return Response({'error': 'Board not found'}, status=404)

    role = _resolve_role(request.user, board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)
    if role not in ('owner', 'edit'):
        return Response({'error': 'Forbidden'}, status=403)

    col = Column.objects.create(board=board, name=name, order=board.columns.count())
    return Response({'id': col.id, 'name': col.name, 'order': col.order, 'cards': []}, status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def column_detail(request, col_id):
    try:
        col = Column.objects.select_related('board').get(pk=col_id)
    except Column.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    role = _resolve_role(request.user, col.board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)
    if role not in ('owner', 'edit'):
        return Response({'error': 'Forbidden'}, status=403)

    if request.method == 'PATCH':
        name = request.data.get('name', '').strip()
        if name:
            col.name = name
            col.save()
        return Response({'id': col.id, 'name': col.name, 'order': col.order})

    col.delete()
    return Response(status=204)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def column_reorder(request):
    board_id = request.data.get('board_id')
    ordered_ids = request.data.get('ordered_ids', [])
    if not board_id:
        return Response({'error': 'board_id required'}, status=400)
    if not isinstance(ordered_ids, list):
        return Response({'error': 'ordered_ids must be a list'}, status=400)

    try:
        board = Board.objects.get(pk=board_id)
    except Board.DoesNotExist:
        return Response({'error': 'Board not found'}, status=404)

    role = _resolve_role(request.user, board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)
    if role not in ('owner', 'edit'):
        return Response({'error': 'Forbidden'}, status=403)

    columns = {c.id: c for c in Column.objects.filter(board=board)}
    updates = []
    for index, col_id in enumerate(ordered_ids):
        col = columns.get(int(col_id))
        if col:
            col.order = index
            updates.append(col)
    Column.objects.bulk_update(updates, ['order'])

    return Response([_column(c) for c in Column.objects.filter(board=board).order_by('order')])


# ── Cards ─────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def card_create(request):
    col_id = request.data.get('column_id')
    title = request.data.get('title', '').strip()
    if not col_id or not title:
        return Response({'error': 'column_id and title required'}, status=400)
    try:
        col = Column.objects.select_related('board').get(pk=col_id)
    except Column.DoesNotExist:
        return Response({'error': 'Column not found'}, status=404)

    role = _resolve_role(request.user, col.board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)
    if role not in ('owner', 'edit'):
        return Response({'error': 'Forbidden'}, status=403)

    card = Card.objects.create(
        column=col,
        title=title,
        description=request.data.get('description', ''),
        order=col.cards.count(),
    )
    CardActivity.objects.create(
        board=col.board,
        card_title=title,
        change=f'Created in "{col.name}"',
        changed_by=request.user,
    )
    return Response(_card(card), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def card_detail(request, card_id):
    try:
        card = Card.objects.select_related('assigned_to', 'column__board').prefetch_related(
            Prefetch('checklists', queryset=Checklist.objects.prefetch_related('items'))
        ).get(pk=card_id)
    except Card.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    board = card.column.board
    role = _resolve_role(request.user, board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)

    if request.method == 'GET':
        return Response(_card(card, full=True))

    can_edit = role in ('owner', 'edit')

    if request.method == 'PATCH':
        if not can_edit:
            return Response({'error': 'Forbidden'}, status=403)

        old_col = card.column
        title = request.data.get('title', card.title).strip() or card.title
        description = request.data.get('description', card.description)
        new_col_id = request.data.get('column_id')

        card.title = title
        card.description = description

        if 'assigned_to_id' in request.data:
            raw = request.data.get('assigned_to_id')
            card.assigned_to_id = int(raw) if raw else None

        if new_col_id and int(new_col_id) != card.column_id:
            try:
                new_col = Column.objects.get(pk=new_col_id, board=board)
                card.column = new_col
                card.order = new_col.cards.count()
                CardActivity.objects.create(
                    board=board,
                    card_title=title,
                    change=f'Moved from "{old_col.name}" to "{new_col.name}"',
                    changed_by=request.user,
                )
            except Column.DoesNotExist:
                pass

        card.save()
        return Response(_card(card))

    if not _can_delete(request.user, board):
        return Response({'error': 'Forbidden'}, status=403)
    CardActivity.objects.create(
        board=board,
        card_title=card.title,
        change=f'Deleted from "{card.column.name}"',
        changed_by=request.user,
    )
    card.delete()
    return Response(status=204)


# ── Checklists ────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checklist_create(request, card_id):
    name = request.data.get('name', '').strip()
    if not name:
        return Response({'error': 'Name required'}, status=400)
    try:
        card = Card.objects.select_related('column__board').get(pk=card_id)
    except Card.DoesNotExist:
        return Response({'error': 'Card not found'}, status=404)

    role = _resolve_role(request.user, card.column.board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)
    if role not in ('owner', 'edit'):
        return Response({'error': 'Forbidden'}, status=403)

    cl = Checklist.objects.create(card=card, name=name, order=card.checklists.count())
    return Response(_checklist(cl), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def checklist_detail(request, cl_id):
    try:
        cl = Checklist.objects.select_related('card__column__board').get(pk=cl_id)
    except Checklist.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    role = _resolve_role(request.user, cl.card.column.board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)
    if role not in ('owner', 'edit'):
        return Response({'error': 'Forbidden'}, status=403)

    if request.method == 'PATCH':
        name = request.data.get('name', '').strip()
        if name:
            cl.name = name
            cl.save()
        return Response({'id': cl.id, 'name': cl.name, 'order': cl.order})

    cl.delete()
    return Response(status=204)


# ── Checklist Items ───────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def item_create(request, cl_id):
    text = request.data.get('text', '').strip()
    if not text:
        return Response({'error': 'Text required'}, status=400)
    try:
        cl = Checklist.objects.select_related('card__column__board').get(pk=cl_id)
    except Checklist.DoesNotExist:
        return Response({'error': 'Checklist not found'}, status=404)

    role = _resolve_role(request.user, cl.card.column.board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)
    if role not in ('owner', 'edit'):
        return Response({'error': 'Forbidden'}, status=403)

    item = ChecklistItem.objects.create(checklist=cl, text=text, order=cl.items.count())
    return Response(_item(item), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def item_detail(request, item_id):
    try:
        item = ChecklistItem.objects.select_related('checklist__card__column__board').get(pk=item_id)
    except ChecklistItem.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    role = _resolve_role(request.user, item.checklist.card.column.board)
    if role is None:
        return Response({'error': 'Not found'}, status=404)
    if role not in ('owner', 'edit'):
        return Response({'error': 'Forbidden'}, status=403)

    if request.method == 'PATCH':
        if 'text' in request.data:
            text = request.data['text'].strip()
            if text:
                item.text = text
        if 'checked' in request.data:
            item.checked = bool(request.data['checked'])
        item.save()
        return Response(_item(item))

    item.delete()
    return Response(status=204)


# ── Members ───────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def member_list(request):
    users = User.objects.filter(is_active=True).order_by('first_name', 'last_name', 'username')
    return Response([_user_brief(u) for u in users])


# ── Team Overview (manager only) ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def team_overview(request):
    if not request.user.groups.filter(name='manager').exists():
        return Response({'error': 'Forbidden'}, status=403)

    cards = (Card.objects
             .filter(column__board__in=_visible_boards(request.user))
             .select_related('assigned_to', 'column__board')
             .prefetch_related(
                 Prefetch('checklists', queryset=Checklist.objects.prefetch_related('items'))
             )
             .order_by('column__board__name', 'column__order', 'order'))

    def _overview_card(card):
        all_items = [i for cl in card.checklists.all() for i in cl.items.all()]
        return {
            'id':              card.id,
            'title':           card.title,
            'description':     card.description,
            'board':           card.column.board.name,
            'column':          card.column.name,
            'checklist_total': len(all_items),
            'checklist_done':  sum(1 for i in all_items if i.checked),
        }

    assigned = {}
    unassigned = []

    for card in cards:
        card_data = _overview_card(card)
        if card.assigned_to:
            uid = card.assigned_to.id
            if uid not in assigned:
                assigned[uid] = {'user': _user_brief(card.assigned_to), 'cards': []}
            assigned[uid]['cards'].append(card_data)
        else:
            unassigned.append(card_data)

    return Response({
        'assigned':   list(assigned.values()),
        'unassigned': unassigned,
    })


# ── Activity ──────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def activity_list(request):
    activities = (CardActivity.objects
                  .filter(board__in=_visible_boards(request.user))
                  .select_related('board', 'changed_by')[:10])
    return Response([
        {
            'id':         a.id,
            'board_name': a.board.name,
            'card_title': a.card_title,
            'change':     a.change,
            'changed_by': a.changed_by.username if a.changed_by else None,
            'timestamp':  a.timestamp,
        }
        for a in activities
    ])
