from django.urls import path
from . import views

urlpatterns = [
    path('',                             views.resource_list,    name='team-resources-list'),
    path('archive/',                     views.archive_list,     name='team-resources-archive'),
    path('<int:resource_id>/',           views.resource_detail,  name='team-resources-detail'),
    path('<int:resource_id>/restore/',   views.resource_restore, name='team-resources-restore'),
    path('<int:resource_id>/purge/',     views.resource_purge,   name='team-resources-purge'),
]
