from django.contrib import admin

from .models import AuditEvent, ContainerSecurityReport, TokenUsage


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'severity', 'event_type', 'actor', 'target', 'ip_address', 'message')
    list_filter = ('severity', 'category', 'event_type')
    search_fields = ('message', 'target', 'actor__username', 'ip_address')

    # An audit log is only trustworthy if it can't be edited after the fact.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


admin.site.register(ContainerSecurityReport)
admin.site.register(TokenUsage)
