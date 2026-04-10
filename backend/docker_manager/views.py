from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ContainerRecord


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def container_list(request):
    containers = ContainerRecord.objects.all()
    return Response([
        {
            'id':        c.id,
            'name':      c.name,
            'cluster':   c.cluster or c.name,
            'image':     c.image,
            'status':    c.status,
            'last_seen': c.last_seen,
        }
        for c in containers
    ])
