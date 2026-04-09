from django.db.models import Avg, Count, F, ExpressionWrapper, DurationField, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Ticket, TicketScreenshot, Comment
from .serializers import TicketSerializer, CommentSerializer


def is_support(user):
    return user.groups.filter(name__in=['support', 'support-admin']).exists() or user.is_superuser


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def ticket_list(request):
    if not is_support(request.user):
        return Response({'error': 'Support access required.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        status_filter = request.query_params.get('status')
        limit = int(request.query_params.get('limit', 30))
        qs = Ticket.objects.select_related('assigned_to', 'created_by').prefetch_related('screenshots', 'comments')
        if status_filter:
            qs = qs.filter(status=status_filter)
        qs = qs[:limit]
        return Response(TicketSerializer(qs, many=True, context={'request': request}).data)

    serializer = TicketSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        ticket = serializer.save()
        return Response(TicketSerializer(ticket, context={'request': request}).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def ticket_detail(request, pk):
    if not is_support(request.user):
        return Response({'error': 'Support access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        ticket = Ticket.objects.select_related('assigned_to', 'created_by').prefetch_related('screenshots', 'comments__author').get(pk=pk)
    except Ticket.DoesNotExist:
        return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(TicketSerializer(ticket, context={'request': request}).data)

    if request.method == 'PATCH':
        serializer = TicketSerializer(ticket, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if request.method == 'DELETE':
        ticket.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_screenshot(request, pk):
    if not is_support(request.user):
        return Response({'error': 'Support access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        ticket = Ticket.objects.get(pk=pk)
    except Ticket.DoesNotExist:
        return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    images = request.FILES.getlist('images')
    if not images:
        return Response({'error': 'No images provided.'}, status=status.HTTP_400_BAD_REQUEST)

    created = [
        {'id': s.id, 'image': request.build_absolute_uri(s.image.url)}
        for s in [TicketScreenshot.objects.create(ticket=ticket, image=img) for img in images]
    ]
    return Response(created, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_comment(request, pk):
    if not is_support(request.user):
        return Response({'error': 'Support access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        ticket = Ticket.objects.get(pk=pk)
    except Ticket.DoesNotExist:
        return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = CommentSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(ticket=ticket, author=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def metrics(request):
    if not is_support(request.user):
        return Response({'error': 'Support access required.'}, status=status.HTTP_403_FORBIDDEN)

    now = timezone.now()
    last_7 = now - timedelta(days=7)
    last_30 = now - timedelta(days=30)

    counts = {row['status']: row['count'] for row in Ticket.objects.values('status').annotate(count=Count('id'))}

    resolved_qs = Ticket.objects.filter(status__in=['resolved', 'closed'], resolved_at__isnull=False)
    avg_duration = resolved_qs.annotate(
        duration=ExpressionWrapper(F('resolved_at') - F('created_at'), output_field=DurationField())
    ).aggregate(avg=Avg('duration'))['avg']
    avg_hours = round(avg_duration.total_seconds() / 3600, 1) if avg_duration else None

    per_assignee = list(
        Ticket.objects.filter(assigned_to__isnull=False)
        .values('assigned_to__username', 'assigned_to__first_name', 'assigned_to__last_name')
        .annotate(total=Count('id'), open=Count('id', filter=Q(status='open')))
        .order_by('-total')[:10]
    )

    trend = list(
        Ticket.objects.filter(created_at__gte=last_30)
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(count=Count('id'))
        .order_by('day')
    )

    return Response({
        'counts': {
            'open': counts.get('open', 0),
            'in_progress': counts.get('in_progress', 0),
            'resolved': counts.get('resolved', 0),
            'closed': counts.get('closed', 0),
            'total': sum(counts.values()),
        },
        'avg_resolution_hours': avg_hours,
        'created_last_7_days': Ticket.objects.filter(created_at__gte=last_7).count(),
        'created_last_30_days': Ticket.objects.filter(created_at__gte=last_30).count(),
        'resolved_last_7_days': resolved_qs.filter(resolved_at__gte=last_7).count(),
        'resolved_last_30_days': resolved_qs.filter(resolved_at__gte=last_30).count(),
        'per_assignee': per_assignee,
        'daily_trend': trend,
    })
