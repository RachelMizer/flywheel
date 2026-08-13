from django.core.management.base import BaseCommand

from docker_manager.models import ContainerRecord

# Ignition / SCADA-themed demo containers. These stand in on the public Render
# deploy, which has no Docker daemon; a local reporter agent overwrites the rows
# for containers it actually finds running (matched by container_id).
DEMO_CONTAINERS = [
    {
        'container_id': 'demo-ign-gw-line-a',
        'name': 'ignition-gateway-a',
        'cluster': 'Plant Floor — Line A',
        'image': 'inductiveautomation/ignition:8.1',
        'status': ContainerRecord.STATUS_HEALTHY,
        'notes': 'Primary Ignition gateway. 14 project resources under '
                 '/usr/local/bin/ignition/data/projects.',
    },
    {
        'container_id': 'demo-mqtt-line-a',
        'name': 'mqtt-broker-a',
        'cluster': 'Plant Floor — Line A',
        'image': 'eclipse-mosquitto:2',
        'status': ContainerRecord.STATUS_HEALTHY,
        'notes': 'MQTT broker for Line A edge nodes. Config at '
                 '/mosquitto/config/mosquitto.conf.',
    },
    {
        'container_id': 'demo-historian-line-a',
        'name': 'edge-historian-a',
        'cluster': 'Plant Floor — Line A',
        'image': 'timescale/timescaledb:2.15-pg16',
        'status': ContainerRecord.STATUS_WORKING,
        'notes': 'Tag historian. Backfilling 3 partitions — elevated write load.',
    },
    {
        'container_id': 'demo-ign-gw-line-b',
        'name': 'ignition-gateway-b',
        'cluster': 'Plant Floor — Line B',
        'image': 'inductiveautomation/ignition:8.1',
        'status': ContainerRecord.STATUS_HEALTHY,
        'notes': 'Standby Ignition gateway (redundant). 14 project resources '
                 'synced from Line A.',
    },
    {
        'container_id': 'demo-opcua-line-b',
        'name': 'opcua-server-b',
        'cluster': 'Plant Floor — Line B',
        'image': 'open62541/open62541:1.3',
        'status': ContainerRecord.STATUS_DOWN,
        'notes': 'OPC-UA server unreachable since 03:12. Node set file present '
                 'at /config/nodeset.xml but process is not listening on 4840.',
    },
    {
        'container_id': 'demo-historian-central',
        'name': 'historian-db',
        'cluster': 'Central',
        'image': 'postgres:16',
        'status': ContainerRecord.STATUS_HEALTHY,
        'notes': 'Central historian database. 8 tablespaces under /var/lib/'
                 'postgresql/data.',
    },
    {
        'container_id': 'demo-grafana-central',
        'name': 'grafana-dashboards',
        'cluster': 'Central',
        'image': 'grafana/grafana:10.4.2',
        'status': ContainerRecord.STATUS_HEALTHY,
        'notes': 'Plant dashboards. 6 provisioned dashboard JSON files under '
                 '/etc/grafana/provisioning/dashboards.',
    },
    {
        'container_id': 'demo-config-repo-central',
        'name': 'config-repo',
        'cluster': 'Central',
        'image': 'nginx:1.27-alpine',
        'status': ContainerRecord.STATUS_WORKING,
        'notes': 'Serves versioned Ignition config exports over HTTP. '
                 'Reindexing /usr/share/nginx/html/configs.',
    },
]


class Command(BaseCommand):
    help = (
        'Seed the demo Docker container registry rows. Guarded independently of '
        'the rest of the demo data so it also populates an already-seeded deploy. '
        'No-ops once any ContainerRecord exists unless --force is given.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Overwrite the demo rows by container_id even if some already '
                 'exist. Does not delete non-demo rows a reporter may have added.',
        )

    def handle(self, *args, **options):
        if ContainerRecord.objects.exists() and not options['force']:
            self.stdout.write(
                'Container registry already populated — skipping. '
                'Use --force to re-seed the demo rows.'
            )
            return

        created = 0
        for row in DEMO_CONTAINERS:
            _, was_created = ContainerRecord.objects.update_or_create(
                container_id=row['container_id'],
                defaults={k: v for k, v in row.items() if k != 'container_id'},
            )
            created += 1 if was_created else 0

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(DEMO_CONTAINERS)} demo containers ({created} new).'
        ))
