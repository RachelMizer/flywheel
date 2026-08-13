from django.core.management import call_command
from django.core.management.base import BaseCommand

from projects.models import Project


class Command(BaseCommand):
    help = (
        'Load the demo dataset (users, groups, boards, backlog, project). '
        'Safe to run on every deploy: it no-ops once the data is present.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-load even if demo data already exists. Rows are matched by '
                 'primary key, so this reverts edits made through the live UI.',
        )

    def handle(self, *args, **options):
        # The fixture carries the groups and their permission sets, so it does not
        # need setup_groups to have run first — loaddata on a bare post-migrate
        # database is enough.
        if Project.objects.exists() and not options['force']:
            self.stdout.write(
                'Demo data already present — skipping. Use --force to re-load.'
            )
        else:
            call_command('loaddata', 'seed_data.json')
            self.stdout.write(self.style.SUCCESS('Demo data loaded.'))

        # Container demo rows are seeded and guarded separately (on their own
        # table's emptiness), so this also populates the Docker registry on a
        # deploy whose Project data already existed before this feature shipped.
        call_command('seed_containers', force=options['force'])
