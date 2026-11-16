from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import TokenAuthentication

from .audit import client_ip

# Only write last-used once a minute per token, so every API call isn't a DB write.
TOUCH_INTERVAL = timedelta(seconds=60)


class TrackedTokenAuthentication(TokenAuthentication):
    """TokenAuthentication that records when and from where each token was last used."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            _touch(result[1], request)
        return result


def _touch(token, request):
    from .models import TokenUsage

    now = timezone.now()
    ip = client_ip(request)
    usage = TokenUsage.objects.filter(token=token).first()
    if usage and usage.last_used_at and now - usage.last_used_at < TOUCH_INTERVAL \
            and usage.last_ip == ip:
        return
    TokenUsage.objects.update_or_create(token=token, defaults={'last_used_at': now, 'last_ip': ip})
