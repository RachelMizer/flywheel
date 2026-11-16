"""Pure-ish evaluation logic: turns stored state into findings and checks.

Kept apart from views so it's testable and so the upload signal and the
Exposure endpoint share one definition of "risky file".
"""
import io
import re
import zipfile
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

SEVERITY_ORDER = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4}

# ── Uploads ──────────────────────────────────────────────────────────────────

EXECUTABLE_EXTS = {'exe', 'dll', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'js', 'jse', 'msi',
                   'jar', 'sh', 'hta', 'html', 'htm', 'svg', 'lnk', 'docm', 'xlsm', 'pptm'}
MAGIC = {
    'pdf':  [b'%PDF'],
    'docx': [b'PK\x03\x04'], 'xlsx': [b'PK\x03\x04'], 'pptx': [b'PK\x03\x04'],
    'doc':  [b'\xd0\xcf\x11\xe0'], 'xls': [b'\xd0\xcf\x11\xe0'], 'ppt': [b'\xd0\xcf\x11\xe0'],
    'png':  [b'\x89PNG'],
    'jpg':  [b'\xff\xd8\xff'], 'jpeg': [b'\xff\xd8\xff'],
}
TEXT_EXTS = {'txt', 'md', 'markdown'}
LARGE_FILE = 10 * 1024 * 1024
OLE_VBA_MARKER = '_VBA_PROJECT'.encode('utf-16-le')
PDF_ACTIVE = re.compile(rb'/(JavaScript|JS|Launch|OpenAction|EmbeddedFile)\b')

_upload_cache = {}


def _flag(severity, label):
    return {'severity': severity, 'label': label}


def analyze_upload(resource):
    """Inspect a TeamResource's bytes for things an extension allow-list misses:
    content that doesn't match its extension, macro payloads hidden in an
    allowed Office type, active PDF content, and disguised double extensions."""
    name = resource.file.name.rsplit('/', 1)[-1]
    try:
        size = resource.file.size
    except (OSError, ValueError):
        size = None
    key = (resource.pk, resource.file.name, size)
    if key in _upload_cache:
        return _upload_cache[key]

    flags = []
    parts = name.lower().split('.')
    ext = parts[-1] if len(parts) > 1 else ''
    # Django appends a random suffix to colliding names (report_a1B2c3D.pdf),
    # which never adds a dot, so inner dotted segments are the user's own.
    inner = [p for p in parts[1:-1] if p in EXECUTABLE_EXTS]
    if inner:
        flags.append(_flag('high', f'Double extension hides .{inner[-1]}'))

    data = None
    if size is None:
        flags.append(_flag('medium', 'File missing from storage'))
    else:
        try:
            with resource.file.open('rb') as fh:
                data = fh.read()
        except OSError:
            flags.append(_flag('medium', 'File unreadable'))

    if data is not None:
        expected = MAGIC.get(ext)
        if expected and not any(data.startswith(m) for m in expected):
            if data.startswith(b'MZ'):
                flags.append(_flag('critical', f'Windows executable disguised as .{ext}'))
            else:
                flags.append(_flag('high', f'Content does not match .{ext}'))
        if ext in TEXT_EXTS:
            if data.startswith(b'MZ') or b'\x00' in data[:4096]:
                flags.append(_flag('high', 'Binary content in a text file'))
            elif re.search(rb'<\s*script', data[:1_000_000], re.I):
                flags.append(_flag('low', 'Contains <script> markup'))
        if ext in ('docx', 'xlsx', 'pptx') and data.startswith(b'PK'):
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as zf:
                    if any(n.lower().endswith('vbaproject.bin') for n in zf.namelist()):
                        flags.append(_flag('critical', 'Contains VBA macros (renamed macro-enabled file)'))
            except zipfile.BadZipFile:
                flags.append(_flag('high', 'Corrupt Office archive'))
        if ext in ('doc', 'xls', 'ppt') and OLE_VBA_MARKER in data:
            flags.append(_flag('high', 'Legacy Office file contains VBA macros'))
        if ext == 'pdf':
            hits = sorted({m.decode() for m in PDF_ACTIVE.findall(data)})
            if hits:
                flags.append(_flag('high' if {'JavaScript', 'JS', 'Launch'} & set(hits) else 'medium',
                                   'Active PDF content: ' + ', '.join('/' + h for h in hits)))
    if size and size > LARGE_FILE:
        flags.append(_flag('low', f'Large file ({size / 1024 / 1024:.1f} MB)'))

    flags.sort(key=lambda f: SEVERITY_ORDER[f['severity']])
    result = {'name': name, 'size': size, 'flags': flags,
              'severity': flags[0]['severity'] if flags else None}
    _upload_cache[key] = result
    return result


# ── Containers ───────────────────────────────────────────────────────────────

# Ports where unauthenticated network exposure is especially dangerous on a
# plant network (or is an ICS protocol with no auth at all).
OT_PORTS = {
    102:   'Siemens S7',
    502:   'Modbus/TCP',
    1883:  'MQTT (plaintext)',
    4840:  'OPC UA',
    8088:  'Ignition gateway (HTTP)',
    8043:  'Ignition gateway (HTTPS)',
    8060:  'Ignition gateway network',
    20000: 'DNP3',
    44818: 'EtherNet/IP',
    47808: 'BACnet',
}
SERVICE_PORTS = {
    5432: 'PostgreSQL', 3306: 'MySQL', 6379: 'Redis', 27017: 'MongoDB',
    2375: 'Docker API (plaintext)', 2376: 'Docker API', 3000: 'Grafana', 22: 'SSH',
}
SENSITIVE_HOST_PATHS = ['/', '/etc', '/root', '/var/run', '/run', '/proc', '/sys', '/boot',
                        '/home', '/var/lib/docker', 'c:']
DANGEROUS_CAPS = {'ALL', 'SYS_ADMIN', 'NET_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'DAC_READ_SEARCH',
                  'NET_RAW'}
SENSITIVE_PREFIXES = ('/etc', '/root', '/proc', '/sys', '/boot')
IMAGE_STALE_DAYS = 180


def _finding(severity, code, title, detail=''):
    return {'severity': severity, 'code': code, 'title': title, 'detail': detail}


def image_tag_info(image):
    """Classify how reproducible an image reference is."""
    if '@sha256:' in image:
        return 'digest', None
    last = image.rsplit('/', 1)[-1]
    tag = last.split(':', 1)[1] if ':' in last else ''
    if not tag or tag == 'latest':
        return 'latest', tag or 'latest'
    # "2", "7-alpine", "8.1" float across patch releases; "1.27.3" doesn't.
    if not re.match(r'^v?\d+\.\d+\.\d+', tag):
        return 'floating', tag
    return 'pinned', tag


def config_drift(report):
    base, cur = report.config_baseline or {}, report.config_current or {}
    added = sorted(set(cur) - set(base))
    removed = sorted(set(base) - set(cur))
    modified = sorted(p for p in set(base) & set(cur) if base[p] != cur[p])
    return {'added': added, 'removed': removed, 'modified': modified,
            'drifted': bool(added or removed or modified)}


def _is_sensitive(source):
    """Exact match on any sensitive host path, or anything beneath the system dirs."""
    s = (source or '').replace('\\', '/').rstrip('/').lower() or '/'
    exact = {p.rstrip('/') or '/' for p in SENSITIVE_HOST_PATHS}
    return s in exact or any(s.startswith(p + '/') for p in SENSITIVE_PREFIXES)


def container_findings(container, report):
    """Findings for one container. ``report`` may be None (agent never sent posture)."""
    f = []
    kind, tag = image_tag_info(container.image or '')
    if kind == 'latest':
        f.append(_finding('medium', 'image_latest', 'Image uses :latest',
                          'Unpinned — a redeploy can silently pull a different image.'))
    elif kind == 'floating':
        f.append(_finding('low', 'image_floating', f'Floating image tag :{tag}',
                          'Pin to a full version or digest for reproducible deploys.'))

    if report is None:
        f.append(_finding('info', 'no_posture', 'No security posture reported',
                          'Run report_agent.py against this host to collect posture.'))
        return f

    if report.privileged:
        f.append(_finding('critical', 'privileged', 'Runs in privileged mode',
                          'Full access to host devices; a container escape is trivial.'))
    for m in report.mounts or []:
        src = m.get('source', '')
        if 'docker.sock' in src:
            f.append(_finding('critical', 'docker_socket', 'Docker socket mounted',
                              f'{src} → {m.get("destination")}: equivalent to root on the host.'))
        elif _is_sensitive(src) and m.get('rw'):
            f.append(_finding('critical', 'sensitive_mount', f'Host path {src} mounted read-write',
                              f'Mounted at {m.get("destination")}.'))
        elif _is_sensitive(src):
            f.append(_finding('medium', 'sensitive_mount_ro', f'Host path {src} mounted read-only',
                              f'Mounted at {m.get("destination")}.'))
    if report.network_mode == 'host':
        f.append(_finding('high', 'host_network', 'Uses host networking',
                          'Shares the host network stack; every listening port is exposed.'))
    caps = sorted(set(c.upper().removeprefix('CAP_') for c in report.cap_add or []) & DANGEROUS_CAPS)
    if caps:
        f.append(_finding('high', 'dangerous_caps', 'Dangerous capabilities added', ', '.join(caps)))
    if report.runs_as_root:
        f.append(_finding('medium', 'root_user', 'Process runs as root',
                          f'User: {report.run_user or "root"}. Set a non-root USER.'))

    for p in report.published_ports or []:
        try:
            port = int(p.get('container_port'))
        except (TypeError, ValueError):
            continue
        host_ip = p.get('host_ip') or '0.0.0.0'
        public = host_ip in ('0.0.0.0', '::', '')
        label = OT_PORTS.get(port) or SERVICE_PORTS.get(port) or f'port {port}'
        where = f'{host_ip}:{p.get("host_port")} → {port}/{p.get("protocol", "tcp")}'
        if not public:
            f.append(_finding('info', 'port_loopback', f'{label} published on {host_ip}', where))
        elif port in OT_PORTS or port in (2375,):
            f.append(_finding('high', 'ot_port_public', f'{label} exposed on all interfaces', where))
        else:
            f.append(_finding('low', 'port_public', f'{label} exposed on all interfaces', where))

    for s in report.services or []:
        name = s.get('service', '?')
        if s.get('anonymous'):
            exposed = any(str(p.get('host_ip') or '0.0.0.0') in ('0.0.0.0', '::', '')
                          for p in report.published_ports or [])
            sev = 'critical' if exposed else 'high'
            f.append(_finding(sev, f'{name}_anonymous', f'{name.upper()} allows unauthenticated access',
                              s.get('detail') or ''))
        if s.get('tls') is False and name == 'mqtt':
            f.append(_finding('medium', 'mqtt_no_tls', 'MQTT traffic is unencrypted',
                              'No TLS listener configured; credentials and tag values travel in clear text.'))

    if report.image_created and timezone.now() - report.image_created > timedelta(days=IMAGE_STALE_DAYS):
        age = (timezone.now() - report.image_created).days
        f.append(_finding('low', 'image_stale', f'Image is {age} days old',
                          'Old base images accumulate unpatched CVEs; rebuild or update.'))

    cves = report.cve_counts or {}
    if cves.get('critical'):
        f.append(_finding('critical', 'cve_critical', f'{cves["critical"]} critical CVE(s) in image',
                          f'Scanned by {report.cve_scanner or "scanner"}.'))
    if cves.get('high'):
        f.append(_finding('high', 'cve_high', f'{cves["high"]} high CVE(s) in image',
                          f'Scanned by {report.cve_scanner or "scanner"}.'))

    drift = config_drift(report)
    if drift['drifted']:
        n = len(drift['added']) + len(drift['removed']) + len(drift['modified'])
        f.append(_finding('high', 'config_drift', f'{n} config file(s) changed since baseline',
                          'Review the change; accept it as the new baseline if it was intended.'))

    f.sort(key=lambda x: SEVERITY_ORDER[x['severity']])
    return f


# ── Platform posture ─────────────────────────────────────────────────────────

# Passwords that must never guard a real account.
WEAK_PASSWORDS = {'admin', 'password', 'flywheel', 'changeme', '123456', 'password1', 'letmein', 'qwerty'}
# Hash-checking costs a full PBKDF2 run per candidate, so unseen accounts get a
# shorter list, and only privileged ones are checked eagerly.
HASH_CHECK_CANDIDATES = ['admin', 'password', 'changeme']
PRIVILEGED_GROUPS = ('manager', 'support-admin', 'support')


def is_weak_password(user, raw):
    return raw.lower() in WEAK_PASSWORDS or raw.lower() == user.username.lower()


def note_password(user, raw):
    """Record weakness from a plaintext we already have (login)."""
    from .models import PasswordAudit
    PasswordAudit.objects.update_or_create(
        user=user, defaults={'password_hash': user.password, 'weak': is_weak_password(user, raw)})


def users_with_weak_passwords():
    from django.contrib.auth.models import User
    from django.db.models import Q
    from .models import PasswordAudit

    audits = {a.user_id: a for a in PasswordAudit.objects.all()}
    privileged = set(User.objects.filter(
        Q(is_superuser=True) | Q(is_staff=True) | Q(groups__name__in=PRIVILEGED_GROUPS)
    ).values_list('id', flat=True))

    weak = []
    for u in User.objects.filter(is_active=True):
        if not u.has_usable_password():
            continue
        a = audits.get(u.id)
        if a is None or a.password_hash != u.password:
            if u.id not in privileged:
                continue  # checked at their next login instead
            hit = any(u.check_password(p) for p in HASH_CHECK_CANDIDATES + [u.username])
            PasswordAudit.objects.update_or_create(
                user=u, defaults={'password_hash': u.password, 'weak': hit})
            if hit:
                weak.append(u)
        elif a.weak:
            weak.append(u)
    return weak


def _check(id_, title, status, detail, weight=2, fix=''):
    return {'id': id_, 'title': title, 'status': status, 'detail': detail,
            'weight': weight, 'fix': fix}


def posture_checks(context):
    """``context`` carries counts computed by the view (tokens, links, findings)
    so this function doesn't re-query what the view already has."""
    from django.contrib.auth.models import User

    c = []
    c.append(_check('debug', 'Debug mode off',
                    'fail' if settings.DEBUG else 'pass',
                    'DEBUG=True leaks stack traces and settings to anyone who triggers an error.'
                    if settings.DEBUG else 'DEBUG is off.', 3, 'Set DEBUG=False in the environment.'))

    insecure_key = settings.SECRET_KEY.startswith('django-insecure') or len(settings.SECRET_KEY) < 40
    c.append(_check('secret_key', 'Unique secret key',
                    'fail' if insecure_key else 'pass',
                    'Using the default development SECRET_KEY, which is committed to the repo.'
                    if insecure_key else 'SECRET_KEY is set from the environment.', 3,
                    'Set SECRET_KEY to a long random value in the environment.'))

    https = getattr(settings, 'SECURE_SSL_REDIRECT', False)
    cookies = getattr(settings, 'SESSION_COOKIE_SECURE', False) and getattr(settings, 'CSRF_COOKIE_SECURE', False)
    hsts = getattr(settings, 'SECURE_HSTS_SECONDS', 0) or 0
    if https and cookies and hsts:
        st, d = 'pass', f'HTTPS enforced, secure cookies, HSTS {hsts}s.'
    elif https and cookies:
        st, d = 'warn', 'HTTPS redirect and secure cookies on, but no HSTS header.'
    else:
        st, d = 'fail', 'HTTPS is not enforced (expected locally, not in production).'
    c.append(_check('https', 'HTTPS, secure cookies & HSTS', st, d, 2,
                    'Set SECURE_HSTS_SECONDS once HTTPS is confirmed working.'))

    hosts_wild = '*' in settings.ALLOWED_HOSTS
    c.append(_check('allowed_hosts', 'Host header allow-list',
                    'fail' if hosts_wild else 'pass',
                    'ALLOWED_HOSTS contains "*".' if hosts_wild else
                    f'{len(settings.ALLOWED_HOSTS) or "No"} explicit host(s).', 1))

    cors_all = getattr(settings, 'CORS_ALLOW_ALL_ORIGINS', False) or getattr(settings, 'CORS_ORIGIN_ALLOW_ALL', False)
    origins = getattr(settings, 'CORS_ALLOWED_ORIGINS', [])
    insecure_origins = [o for o in origins if o.startswith('http://') and 'localhost' not in o
                        and '127.0.0.1' not in o]
    if cors_all:
        st, d = 'fail', 'Any website can call the API with a user\'s credentials.'
    elif insecure_origins:
        st, d = 'warn', 'Plain-HTTP origins allowed: ' + ', '.join(insecure_origins)
    else:
        st, d = 'pass', f'{len(origins)} allowed origin(s), none wildcard.'
    c.append(_check('cors', 'CORS restricted', st, d, 2))

    weak = context['weak_password_users']
    weak_admins = [u for u in weak if u.is_superuser]
    c.append(_check('default_creds', 'No default or weak passwords',
                    'fail' if weak_admins else 'warn' if weak else 'pass',
                    ('Weak/default password on: ' + ', '.join(u.username for u in weak)
                     + (' — includes a superuser.' if weak_admins else ''))
                    if weak else 'No active account uses a known default password.', 3,
                    'Change these passwords; the reporter agent defaults to admin/admin.'))

    supers = User.objects.filter(is_superuser=True, is_active=True).count()
    c.append(_check('superusers', 'Few superusers', 'warn' if supers > 2 else 'pass',
                    f'{supers} active superuser account(s).', 1))

    stale = context['stale_tokens']
    c.append(_check('tokens', 'No stale API tokens', 'warn' if stale else 'pass',
                    f'{stale} token(s) unused for {context["token_stale_days"]}+ days or older than '
                    f'{context["token_max_age_days"]} days.' if stale else 'All tokens recently used.', 1,
                    'Revoke them from the Auth & Access tab.'))

    old_links = context['old_share_links']
    links = context['active_share_links']
    c.append(_check('share_links', 'Share links under control',
                    'warn' if old_links or links > 3 else 'pass',
                    f'{links} active share link(s); {old_links} enabled for over '
                    f'{context["share_link_stale_days"]} days.'
                    if links else 'No boards have link sharing on.', 1,
                    'Disable links that are no longer needed, or regenerate long-lived ones.'))

    bf = context['brute_force_24h']
    c.append(_check('brute_force', 'No brute-force activity (24h)', 'fail' if bf else 'pass',
                    f'{bf} account(s) hit the failed-login threshold.' if bf else 'None detected.', 2))

    risky = context['risky_uploads']
    c.append(_check('uploads', 'No risky uploads', 'fail' if risky['critical'] else 'warn' if risky['high'] else 'pass',
                    f'{risky["critical"]} critical and {risky["high"]} high-risk file(s) in Team Resources.'
                    if risky['critical'] or risky['high'] else 'Uploaded files look clean.', 2))

    cf = context['container_findings']
    c.append(_check('containers', 'Containers hardened',
                    'fail' if cf['critical'] else 'warn' if cf['high'] else 'pass',
                    f'{cf["critical"]} critical and {cf["high"]} high container finding(s).'
                    if cf['critical'] or cf['high'] else 'No critical or high container findings.', 3))
    return c


def posture_score(checks):
    total = sum(ch['weight'] for ch in checks)
    got = sum(ch['weight'] * {'pass': 1, 'warn': 0.5, 'fail': 0}[ch['status']] for ch in checks)
    return round(100 * got / total) if total else 100
