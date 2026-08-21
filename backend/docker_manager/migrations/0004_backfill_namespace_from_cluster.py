import re

from django.db import migrations

# Nice names for the known demo clusters; anything else falls back to a slug.
CLUSTER_TO_NAMESPACE = {
    'Central': 'central',
    'Plant Floor — Line A': 'line-a',
    'Plant Floor — Line B': 'line-b',
}


def _slug(value):
    s = re.sub(r'[^a-z0-9]+', '-', (value or '').lower()).strip('-')
    return s or 'default'


def backfill(apps, schema_editor):
    """Give existing container rows a namespace derived from their cluster, so the
    new namespace grouping isn't all 'default' on an already-populated deploy.
    Only touches rows whose namespace is still blank."""
    ContainerRecord = apps.get_model('docker_manager', 'ContainerRecord')
    for rec in ContainerRecord.objects.filter(namespace=''):
        rec.namespace = CLUSTER_TO_NAMESPACE.get(rec.cluster) or _slug(rec.cluster)
        rec.save(update_fields=['namespace'])


def unbackfill(apps, schema_editor):
    # Non-destructive reverse.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('docker_manager', '0003_alter_containerrecord_options_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
