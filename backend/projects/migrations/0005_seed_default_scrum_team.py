from django.db import migrations


def seed_scrum_teams(apps, schema_editor):
    """Give any project that has no scrum team yet a sensible default one, so the
    new Scrum Team section isn't empty on first view. Prefers real (non-superuser)
    managers as Scrum Master / Product Owner so the demo shows named people rather
    than the generic `admin` system account, and puts the team-member group in as
    the Development Team. Fully skipped where the pieces aren't there — this only
    ever fills blanks, never overwrites a real choice."""
    Project = apps.get_model('projects', 'Project')
    User = apps.get_model('auth', 'User')

    def ids(qs):
        return list(qs.order_by('first_name', 'username').values_list('id', flat=True))

    # Prefer real people; fall back to any manager (incl. superusers) only if the
    # org has no non-superuser managers at all.
    manager_ids = ids(User.objects.filter(groups__name='manager', is_superuser=False))
    if not manager_ids:
        manager_ids = ids(User.objects.filter(groups__name='manager'))
    team_ids = ids(User.objects.filter(groups__name='team-member'))

    scrum_master_id = manager_ids[0] if manager_ids else None
    product_owner_id = next((m for m in manager_ids if m != scrum_master_id), None)
    # Fall back for Product Owner: any team member who isn't already the SM.
    if product_owner_id is None:
        product_owner_id = next((t for t in team_ids if t != scrum_master_id), None)

    for project in Project.objects.all():
        if project.scrum_master_id or project.product_owner_id or project.developers.exists():
            continue  # already has a team — leave it alone
        project.scrum_master_id = scrum_master_id
        project.product_owner_id = product_owner_id
        project.save(update_fields=['scrum_master', 'product_owner'])
        if team_ids:
            project.developers.set(team_ids)


def unseed(apps, schema_editor):
    # Non-destructive reverse: leave assignments in place. Reversing the migration
    # shouldn't wipe a team someone may have since curated.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0004_project_developers_project_product_owner_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_scrum_teams, unseed),
    ]
