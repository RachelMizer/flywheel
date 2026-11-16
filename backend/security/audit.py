"""Recording security events.

Signals (role changes, share-link toggles, uploads) fire deep inside model
saves with no request in hand, so CurrentRequestMiddleware parks the active
HttpRequest in a thread-local. DRF authenticates inside the view, but its
Request.user setter also writes through to the underlying HttpRequest, so by
the time a view saves anything, ``current_request().user`` is the real caller.
"""
import threading
from contextlib import contextmanager

_local = threading.local()


def current_request():
    return getattr(_local, 'request', None)


def current_user():
    req = current_request()
    user = getattr(req, 'user', None) if req is not None else None
    return user if user is not None and user.is_authenticated else None


class CurrentRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _local.request = request
        try:
            return self.get_response(request)
        finally:
            _local.request = None


@contextmanager
def audit_suppressed():
    """Silence signal-driven events, e.g. while loading fixtures — a seeded user
    is not a real 'user created' or 'role granted' event."""
    prev = getattr(_local, 'suppressed', False)
    _local.suppressed = True
    try:
        yield
    finally:
        _local.suppressed = prev


def is_suppressed():
    return getattr(_local, 'suppressed', False)


def client_ip(request):
    """Best-effort client IP. Behind Render's proxy the client is the first
    X-Forwarded-For hop. That header can be spoofed by the client, which is
    acceptable here: detections key on username, and IP is context only."""
    if request is None:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')
    return ip or None


def record(event_type, category, message, *, severity='info', actor=None, target='',
           request=None, metadata=None, force=False):
    """Write one AuditEvent. ``force`` bypasses suppression (explicit calls from
    views always mean it; only signal receivers should honour suppression)."""
    if is_suppressed() and not force:
        return None
    from .models import AuditEvent

    request = request or current_request()
    if actor is None:
        actor = current_user()
    ua = request.META.get('HTTP_USER_AGENT', '')[:300] if request is not None else ''
    return AuditEvent.objects.create(
        event_type=event_type,
        category=category,
        severity=severity,
        actor=actor,
        target=(target or '')[:200],
        ip_address=client_ip(request),
        user_agent=ua,
        message=message[:500],
        metadata=metadata or {},
    )
