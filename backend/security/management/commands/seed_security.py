import hashlib
from datetime import datetime, timedelta, timezone as dt_timezone

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from docker_manager.models import ContainerRecord
from security.models import AuditEvent, ContainerSecurityReport


def _h(s):
    return hashlib.sha256(s.encode()).hexdigest()


def _d(y, m, d):
    return datetime(y, m, d, tzinfo=dt_timezone.utc)


def _files(prefix, names, tweak=None):
    """Fake config-file hash map; ``tweak`` names files whose content differs."""
    return {f'{prefix}/{n}': _h(n + ('-edited' if tweak and n in tweak else '')) for n in names}


IGN_FILES = ['projects/LineA/project.json', 'projects/LineA/views/overview.json',
             'tags/line-a-tags.json', 'gateway-network.json', 'udts.json']
NGINX_FILES = ['tags-line-a.json', 'udts.json', 'gateway-network.json']
MQTT_FILES = ['mosquitto.conf']

# Posture for the seeded demo containers (seed_containers), chosen to show a
# realistic spread: one critical OT exposure, one privileged container, drift,
# CVEs, and a couple of clean ones.
DEMO_POSTURE = {
    'demo-ign-gw-line-a': dict(
        run_user='2003 (ignition)', network_mode='bridge',
        published_ports=[{'container_port': 8088, 'protocol': 'tcp', 'host_ip': '0.0.0.0', 'host_port': 8088},
                         {'container_port': 8060, 'protocol': 'tcp', 'host_ip': '0.0.0.0', 'host_port': 8060}],
        image_created=_d(2026, 3, 2),
        cve_counts={'critical': 0, 'high': 3, 'medium': 11, 'low': 24}, cve_scanner='trivy',
        config_baseline=_files('/usr/local/bin/ignition/data', IGN_FILES),
        config_current=_files('/usr/local/bin/ignition/data', IGN_FILES, tweak={'tags/line-a-tags.json'}),
    ),
    'demo-mqtt-line-a': dict(
        run_user='1883 (mosquitto)', network_mode='bridge',
        published_ports=[{'container_port': 1883, 'protocol': 'tcp', 'host_ip': '0.0.0.0', 'host_port': 1883}],
        services=[{'service': 'mqtt', 'anonymous': True, 'tls': False,
                   'detail': 'allow_anonymous true on listener 1883; no password_file.'}],
        image_created=_d(2026, 6, 18),
        cve_counts={'critical': 0, 'high': 0, 'medium': 2, 'low': 5}, cve_scanner='trivy',
        config_baseline=_files('/mosquitto/config', MQTT_FILES),
        config_current=_files('/mosquitto/config', MQTT_FILES),
    ),
    'demo-historian-line-a': dict(
        run_user='70 (postgres)', network_mode='bridge',
        published_ports=[{'container_port': 5432, 'protocol': 'tcp', 'host_ip': '127.0.0.1', 'host_port': 5433}],
        image_created=_d(2026, 5, 9),
        cve_counts={'critical': 0, 'high': 1, 'medium': 6, 'low': 19}, cve_scanner='trivy',
    ),
    'demo-ign-gw-line-b': dict(
        run_user='2003 (ignition)', network_mode='bridge',
        published_ports=[{'container_port': 8088, 'protocol': 'tcp', 'host_ip': '127.0.0.1', 'host_port': 9088}],
        image_created=_d(2026, 3, 2),
        cve_counts={'critical': 0, 'high': 3, 'medium': 11, 'low': 24}, cve_scanner='trivy',
        config_baseline=_files('/usr/local/bin/ignition/data', IGN_FILES),
        config_current=_files('/usr/local/bin/ignition/data', IGN_FILES),
    ),
    'demo-opcua-line-b': dict(
        privileged=True, runs_as_root=True, run_user='0 (root)', network_mode='host',
        cap_add=['NET_ADMIN'],
        mounts=[{'source': '/etc', 'destination': '/host/etc', 'rw': False}],
        image_created=_d(2024, 11, 20),
        cve_counts={'critical': 2, 'high': 7, 'medium': 15, 'low': 30}, cve_scanner='trivy',
    ),
    'demo-historian-central': dict(
        run_user='999 (postgres)', network_mode='bridge',
        image_created=_d(2026, 8, 7),
        cve_counts={'critical': 1, 'high': 2, 'medium': 9, 'low': 40}, cve_scanner='trivy',
    ),
    'demo-grafana-central': dict(
        run_user='472 (grafana)', network_mode='bridge',
        published_ports=[{'container_port': 3000, 'protocol': 'tcp', 'host_ip': '0.0.0.0', 'host_port': 3000}],
        image_created=_d(2024, 4, 15),
        cve_counts={'critical': 0, 'high': 4, 'medium': 13, 'low': 21}, cve_scanner='trivy',
    ),
    'demo-config-repo-central': dict(
        runs_as_root=True, run_user='0 (root)', network_mode='bridge',
        mounts=[{'source': '/srv/flywheel/configs', 'destination': '/usr/share/nginx/html/configs', 'rw': False}],
        image_created=_d(2026, 9, 1),
        cve_counts={'critical': 0, 'high': 0, 'medium': 1, 'low': 8}, cve_scanner='trivy',
        config_baseline=_files('/usr/share/nginx/html/configs', NGINX_FILES),
        config_current=_files('/usr/share/nginx/html/configs', NGINX_FILES),
    ),
}

# (hours ago, type, category, severity, actor username, target, ip, message, metadata)
DEMO_EVENTS = [
    (240, 'login_success', 'auth', 'info', 'jmizer', 'jmizer', '10.20.1.14', 'jmizer signed in', {}),
    (220, 'role_added', 'access', 'warning', 'admin', 'mscott', '10.20.1.10',
     'mscott added to manager', {'group': 'manager'}),
    (216, 'share_link_enabled', 'exposure', 'warning', 'jmizer', 'Management Board', '10.20.1.14',
     'Share link enabled on board "Management Board"', {'board_id': 2}),
    (170, 'login_success', 'auth', 'warning', 'kbutler', 'kbutler', '203.0.113.77',
     'kbutler signed in (new IP, off-hours)', {'new_ip': True, 'off_hours': True}),
    (100, 'config_drift', 'container', 'warning', None, 'ignition-gateway-a', None,
     '1 config file(s) on ignition-gateway-a differ from baseline',
     {'container_id': 'demo-ign-gw-line-a', 'added': [], 'removed': [],
      'modified': ['/usr/local/bin/ignition/data/tags/line-a-tags.json']}),
    *[(74 - i * 0.03, 'login_failed', 'auth', 'warning', None, 'admin', '198.51.100.23',
       'Failed login for "admin"', {'unknown_user': False}) for i in range(7)],
    (73.85, 'brute_force_suspected', 'auth', 'critical', None, 'admin', '198.51.100.23',
     '5 failed logins for "admin" within 15 minutes', {'failures': 5}),
    *[(60 - i * 0.05, 'login_failed', 'auth', 'warning', None, 'plc_admin', '198.51.100.23',
       'Failed login for "plc_admin" (unknown user)', {'unknown_user': True}) for i in range(3)],
    (52, 'file_uploaded', 'exposure', 'info', 'jmizer', 'Line A SOP.pdf', '10.20.1.14',
     'Uploaded "Line A SOP.pdf"', {'flags': []}),
    (48, 'share_link_disabled', 'exposure', 'info', 'jmizer', 'Management Board', '10.20.1.14',
     'Share link disabled on board "Management Board"', {'board_id': 2}),
    (30, 'token_revoked', 'auth', 'warning', 'admin', 'teammember4', '10.20.1.10',
     'API token for teammember4 revoked', {}),
    (26, 'login_success', 'auth', 'info', 'rmizer', 'rmizer', '10.20.1.31', 'rmizer signed in', {}),
    (6, 'login_success', 'auth', 'info', 'mscott', 'mscott', '10.20.1.22', 'mscott signed in', {}),
]


class Command(BaseCommand):
    help = ('Seed Security page demo data: posture for the demo containers and a '
            'short audit history. No-ops once any AuditEvent exists unless --force.')

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='Re-apply demo posture and add the demo events again.')

    def handle(self, *args, **options):
        if AuditEvent.objects.filter(metadata__demo=True).exists() and not options['force']:
            self.stdout.write('Security demo data already present — skipping.')
            return

        posture = 0
        for cid, fields in DEMO_POSTURE.items():
            container = ContainerRecord.objects.filter(container_id=cid).first()
            if not container:
                continue
            fields = dict(fields)
            if 'config_baseline' in fields:
                fields['baseline_set_at'] = timezone.now() - timedelta(days=14)
            if 'cve_counts' in fields:
                fields['scanned_at'] = timezone.now() - timedelta(hours=8)
            ContainerSecurityReport.objects.update_or_create(container=container, defaults=fields)
            posture += 1

        users = {u.username: u for u in User.objects.all()}
        now = timezone.now()
        created = 0
        for hours, etype, cat, sev, actor, target, ip, msg, meta in DEMO_EVENTS:
            e = AuditEvent.objects.create(
                event_type=etype, category=cat, severity=sev, actor=users.get(actor),
                target=target, ip_address=ip, message=msg, metadata={**meta, 'demo': True},
                user_agent='Mozilla/5.0 (demo)' if ip else '',
            )
            # created_at is auto_now_add; backdate through the queryset.
            AuditEvent.objects.filter(pk=e.pk).update(created_at=now - timedelta(hours=hours))
            created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Seeded security posture for {posture} containers and {created} audit events.'))
