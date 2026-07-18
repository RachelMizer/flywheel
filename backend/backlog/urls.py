from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/',               views.backlog_dashboard, name='backlog-dashboard'),

    path('epics/',                   views.epic_list,   name='backlog-epic-list'),
    path('epics/<int:epic_id>/',     views.epic_detail,  name='backlog-epic-detail'),

    path('sprints/',                 views.sprint_list,   name='backlog-sprint-list'),
    path('sprints/<int:sprint_id>/', views.sprint_detail, name='backlog-sprint-detail'),

    path('items/',                   views.item_list,    name='backlog-item-list'),
    path('items/reorder/',           views.item_reorder, name='backlog-item-reorder'),
    path('items/<int:item_id>/',           views.item_detail, name='backlog-item-detail'),
    path('items/<int:item_id>/start/',     views.item_start,  name='backlog-item-start'),

    path('stories/',                 views.user_story_list,   name='backlog-story-list'),
    path('stories/<int:story_id>/',  views.user_story_detail, name='backlog-story-detail'),
]
