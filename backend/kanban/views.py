from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CardActivity


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def activity_list(request):
    activities = CardActivity.objects.select_related('board', 'changed_by')[:10]
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
