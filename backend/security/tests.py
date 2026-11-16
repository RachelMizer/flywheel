from django.contrib.auth.models import Group, User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from docker_manager.models import ContainerRecord
from kanban.models import Board
from team_resources.models import TeamResource

from .analysis import analyze_upload, container_findings, image_tag_info
from .audit import audit_suppressed
from .models import AuditEvent, ContainerSecurityReport, TokenUsage


class Base(TestCase):
    def setUp(self):
        self.manager_group = Group.objects.create(name='manager')
        Group.objects.create(name='team-member')
        self.mgr = User.objects.create_user('boss', password='S3cure-pass-xyz')
        self.mgr.groups.add(self.manager_group)
        self.member = User.objects.create_user('worker', password='S3cure-pass-xyz')
        self.client = APIClient()

    def as_user(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        return token

    def types(self):
        return list(AuditEvent.objects.values_list('event_type', flat=True))


class AuthEventTests(Base):
    def test_failed_logins_trigger_brute_force_once(self):
        for _ in range(7):
            r = self.client.post('/api/auth/login/', {'username': 'boss', 'password': 'nope'},
                                 REMOTE_ADDR='198.51.100.9')
            self.assertEqual(r.status_code, 401)
        self.assertEqual(self.types().count('login_failed'), 7)
        self.assertEqual(self.types().count('brute_force_suspected'), 1)
        self.assertEqual(AuditEvent.objects.filter(event_type='login_failed').first().ip_address,
                         '198.51.100.9')

    def test_unknown_user_is_flagged(self):
        self.client.post('/api/auth/login/', {'username': 'ghost', 'password': 'x'})
        e = AuditEvent.objects.get(event_type='login_failed')
        self.assertTrue(e.metadata['unknown_user'])

    @override_settings(SECURITY_BUSINESS_HOURS=(0, 24))
    def test_new_ip_login_flagged(self):
        creds = {'username': 'worker', 'password': 'S3cure-pass-xyz'}
        self.client.post('/api/auth/login/', creds, REMOTE_ADDR='10.0.0.1')
        self.client.post('/api/auth/login/', creds, REMOTE_ADDR='10.0.0.1')
        self.client.post('/api/auth/login/', creds, REMOTE_ADDR='10.9.9.9')
        flags = list(AuditEvent.objects.filter(event_type='login_success')
                     .order_by('id').values_list('metadata__new_ip', flat=True))
        self.assertEqual(flags, [False, False, True])

    def test_token_usage_tracked(self):
        token = self.as_user(self.member)
        self.client.get('/api/auth/me/', REMOTE_ADDR='10.1.1.1')
        usage = TokenUsage.objects.get(token=token)
        self.assertEqual(usage.last_ip, '10.1.1.1')


class AccessEventTests(Base):
    def test_role_and_privilege_changes(self):
        self.member.groups.add(self.manager_group)
        self.member.is_superuser = True
        self.member.save()
        e = AuditEvent.objects.get(event_type='role_added', target='worker')
        self.assertEqual(e.severity, 'warning')
        self.assertTrue(AuditEvent.objects.filter(event_type='privilege_granted',
                                                  severity='critical').exists())
        self.member.groups.clear()
        self.assertTrue(AuditEvent.objects.filter(event_type='role_removed',
                                                  metadata__group='manager').exists())

    def test_suppressed_during_seeding(self):
        before = AuditEvent.objects.count()
        with audit_suppressed():
            u = User.objects.create_user('seeded')
            u.groups.add(self.manager_group)
        self.assertEqual(AuditEvent.objects.count(), before)


class ExposureTests(Base):
    def test_share_link_toggle_is_attributed(self):
        board = Board.objects.create(name='B', owner=self.member)
        self.as_user(self.member)
        self.client.patch(f'/api/kanban/boards/{board.id}/', {'link_sharing_enabled': True},
                          format='json')
        e = AuditEvent.objects.get(event_type='share_link_enabled')
        self.assertEqual(e.actor, self.member)
        self.client.post(f'/api/kanban/boards/{board.id}/regenerate-link/')
        self.client.patch(f'/api/kanban/boards/{board.id}/', {'link_sharing_enabled': False},
                          format='json')
        self.assertIn('share_link_disabled', self.types())

    def test_upload_analysis(self):
        exe = TeamResource.objects.create(
            file=SimpleUploadedFile('invoice.pdf', b'MZ\x90\x00 not a pdf'), uploaded_by=self.mgr)
        clean = TeamResource.objects.create(
            file=SimpleUploadedFile('notes.md', b'# Hello'), uploaded_by=self.mgr)
        sneaky = TeamResource.objects.create(
            file=SimpleUploadedFile('payroll.exe.txt', b'hi'), uploaded_by=self.mgr)
        try:
            self.assertEqual(analyze_upload(exe)['severity'], 'critical')
            self.assertIsNone(analyze_upload(clean)['severity'])
            self.assertEqual(analyze_upload(sneaky)['severity'], 'high')
            self.assertEqual(AuditEvent.objects.filter(event_type='file_uploaded',
                                                       severity='warning').count(), 2)
        finally:
            for r in (exe, clean, sneaky):
                r.delete()


class ContainerTests(Base):
    def setUp(self):
        super().setUp()
        self.as_user(self.mgr)

    def report(self, security, cid='abc123'):
        return self.client.post('/api/docker/report/', [{
            'container_id': cid, 'name': 'mqtt', 'image': 'eclipse-mosquitto:2',
            'status': 'healthy', 'security': security}], format='json')

    def test_ingest_findings_and_drift(self):
        r = self.report({
            'runs_as_root': True, 'run_user': '0',
            'published_ports': [{'container_port': 1883, 'protocol': 'tcp',
                                 'host_ip': '0.0.0.0', 'host_port': 1883}],
            'services': [{'service': 'mqtt', 'anonymous': True, 'tls': False}],
            'config_hashes': {'/mosquitto/config/mosquitto.conf': 'aaa'},
        })
        self.assertEqual(r.status_code, 200)
        c = ContainerRecord.objects.get(container_id='abc123')
        codes = {f['code']: f['severity'] for f in container_findings(c, c.security)}
        self.assertEqual(codes['mqtt_anonymous'], 'critical')
        self.assertEqual(codes['ot_port_public'], 'high')
        self.assertEqual(codes['image_floating'], 'low')
        self.assertNotIn('config_drift', codes)

        self.report({'config_hashes': {'/mosquitto/config/mosquitto.conf': 'bbb'}})
        self.report({'config_hashes': {'/mosquitto/config/mosquitto.conf': 'bbb'}})
        self.assertEqual(self.types().count('config_drift'), 1)  # not re-fired each tick

        r = self.client.get('/api/security/containers/')
        entry = next(e for e in r.json() if e['container_id'] == 'abc123')
        self.assertTrue(entry['posture']['drift']['drifted'])

        self.client.post(f'/api/security/containers/{c.id}/baseline/')
        c.security.refresh_from_db()
        self.assertEqual(c.security.config_baseline, {'/mosquitto/config/mosquitto.conf': 'bbb'})

    def test_report_without_security_still_works(self):
        r = self.client.post('/api/docker/report/', {'container_id': 'x1', 'status': 'down'},
                             format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(ContainerSecurityReport.objects.exists())

    def test_image_tags(self):
        self.assertEqual(image_tag_info('redis')[0], 'latest')
        self.assertEqual(image_tag_info('redis:latest')[0], 'latest')
        self.assertEqual(image_tag_info('redis:7-alpine')[0], 'floating')
        self.assertEqual(image_tag_info('grafana/grafana:10.4.2')[0], 'pinned')
        self.assertEqual(image_tag_info('localhost:5000/app')[0], 'latest')
        self.assertEqual(image_tag_info('nginx@sha256:abcd')[0], 'digest')


class PermissionAndEndpointTests(Base):
    def test_team_member_is_forbidden(self):
        self.as_user(self.member)
        for url in ('/api/security/overview/', '/api/security/events/', '/api/security/auth/',
                    '/api/security/exposure/', '/api/security/containers/'):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_manager_endpoints(self):
        self.as_user(self.mgr)
        r = self.client.get('/api/security/overview/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('score', r.json())
        self.assertEqual(self.client.get('/api/security/events/?severity=critical&days=7').status_code, 200)
        self.assertEqual(self.client.get('/api/security/exposure/').status_code, 200)

    def test_weak_password_detected(self):
        User.objects.create_user('admin', password='admin', is_superuser=True)
        self.as_user(self.mgr)
        checks = {c['id']: c for c in self.client.get('/api/security/overview/').json()['checks']}
        self.assertEqual(checks['default_creds']['status'], 'fail')
        self.assertIn('admin', checks['default_creds']['detail'])

    def test_token_revoke(self):
        self.as_user(self.member)
        self.as_user(self.mgr)
        self.assertEqual(self.client.post(f'/api/security/tokens/{self.mgr.id}/revoke/').status_code, 400)
        self.assertEqual(self.client.post(f'/api/security/tokens/{self.member.id}/revoke/').status_code, 204)
        self.assertFalse(Token.objects.filter(user=self.member).exists())
        self.assertIn('token_revoked', self.types())
