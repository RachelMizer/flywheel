from django.contrib.auth.models import User, Group
from django.utils import timezone
from rest_framework import serializers
from .models import Ticket, TicketScreenshot, Comment


class UserBriefSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'role']

    def get_role(self, obj):
        groups = list(obj.groups.values_list('name', flat=True))
        if 'support-admin' in groups:
            return 'Support Manager'
        if 'support' in groups:
            return 'Support'
        if 'admin-user' in groups:
            return 'Admin'
        return 'User'


class ScreenshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketScreenshot
        fields = ['id', 'image', 'uploaded_at']


class CommentSerializer(serializers.ModelSerializer):
    author = UserBriefSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'author', 'body', 'created_at']


class TicketSerializer(serializers.ModelSerializer):
    assigned_to = UserBriefSerializer(read_only=True)
    assigned_to_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='assigned_to', write_only=True, required=False, allow_null=True
    )
    created_by = UserBriefSerializer(read_only=True)
    screenshots = ScreenshotSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = [
            'id', 'ticket_number', 'title', 'site_section', 'short_description', 'detailed_description',
            'status', 'assigned_to', 'assigned_to_id', 'created_by',
            'screenshots', 'comments', 'created_at', 'updated_at', 'resolved_at',
        ]
        read_only_fields = ['ticket_number', 'created_by', 'created_at', 'updated_at', 'resolved_at']

    def _default_assignee(self):
        support_admin = Group.objects.filter(name='support-admin').first()
        if support_admin:
            user = support_admin.user_set.first()
            if user:
                return user
        return None

    def create(self, validated_data):
        if 'assigned_to' not in validated_data or validated_data.get('assigned_to') is None:
            validated_data['assigned_to'] = self._default_assignee()
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Track resolved_at when status changes to resolved
        new_status = validated_data.get('status', instance.status)
        if new_status == Ticket.STATUS_RESOLVED and instance.status != Ticket.STATUS_RESOLVED:
            validated_data['resolved_at'] = timezone.now()
        elif new_status != Ticket.STATUS_RESOLVED:
            validated_data['resolved_at'] = None
        return super().update(instance, validated_data)
