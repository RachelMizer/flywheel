from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.apps import apps


PROTECTED_APPS = ['kanban', 'backlog', 'projects', 'docker_manager']


def get_permissions(actions):
    """Return all permissions matching the given actions across protected apps."""
    perms = []
    for app_label in PROTECTED_APPS:
        for model in apps.get_app_config(app_label).get_models():
            ct = ContentType.objects.get_for_model(model)
            for action in actions:
                try:
                    perms.append(Permission.objects.get(content_type=ct, codename=f'{action}_{model.__name__.lower()}'))
                except Permission.DoesNotExist:
                    pass
    return perms


class Command(BaseCommand):
    help = 'Create the FlyWheel user groups: support, support-admin, manager, teammember'

    def handle(self, *args, **kwargs):
        # support — all permissions
        support, _ = Group.objects.get_or_create(name='support')
        support.permissions.set(get_permissions(['add', 'change', 'delete', 'view']))
        self.stdout.write('  support: add, change, delete, view')

        # manager — everything including delete
        manager, _ = Group.objects.get_or_create(name='manager')
        manager.permissions.set(get_permissions(['add', 'change', 'delete', 'view']))
        self.stdout.write('  manager: add, change, delete, view')

        # team-member — no delete
        team_member, _ = Group.objects.get_or_create(name='team-member')
        team_member.permissions.set(get_permissions(['add', 'change', 'view']))
        self.stdout.write('  team-member: add, change, view (no delete)')

        # support-admin — same permissions as support
        support_admin, _ = Group.objects.get_or_create(name='support-admin')
        support_admin.permissions.set(get_permissions(['add', 'change', 'delete', 'view']))
        self.stdout.write('  support-admin: add, change, delete, view')

        self.stdout.write(self.style.SUCCESS('Groups created successfully.'))
