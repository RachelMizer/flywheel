from django.db import migrations


def migrate_existing_boards(apps, schema_editor):
    Board = apps.get_model('kanban', 'Board')
    BoardMembership = apps.get_model('kanban', 'BoardMembership')
    User = apps.get_model('auth', 'User')

    try:
        owner = User.objects.get(username='jmizer')
    except User.DoesNotExist:
        return  # nothing to backfill against — leave existing boards ownerless/private

    Board.objects.update(owner=owner, visibility='public')

    other_active_users = User.objects.filter(is_active=True).exclude(pk=owner.pk)
    for board in Board.objects.all():
        for user in other_active_users:
            BoardMembership.objects.get_or_create(
                board=board, user=user,
                defaults={'role': 'edit', 'invited_by': owner},
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('kanban', '0004_board_link_sharing_enabled_board_owner_and_more'),
    ]

    operations = [
        migrations.RunPython(migrate_existing_boards, noop_reverse),
    ]
