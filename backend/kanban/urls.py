from django.urls import path
from . import views

urlpatterns = [
    path('activity/',                    views.activity_list,    name='kanban-activity'),
    path('members/',                     views.member_list,      name='kanban-members'),
    path('overview/',                    views.team_overview,    name='kanban-overview'),
    path('boards/',                      views.board_list,       name='kanban-board-list'),
    path('boards/shared/<str:token>/',   views.board_shared_detail, name='kanban-board-shared'),
    path('boards/members/<int:membership_id>/', views.board_member_detail, name='kanban-board-member-detail'),
    path('boards/<int:board_id>/',       views.board_detail,     name='kanban-board-detail'),
    path('boards/<int:board_id>/members/', views.board_member_create, name='kanban-board-member-create'),
    path('boards/<int:board_id>/regenerate-link/', views.board_regenerate_link, name='kanban-board-regenerate-link'),
    path('columns/',                     views.column_create,    name='kanban-column-create'),
    path('columns/reorder/',             views.column_reorder,   name='kanban-column-reorder'),
    path('columns/<int:col_id>/',        views.column_detail,    name='kanban-column-detail'),
    path('cards/',                       views.card_create,      name='kanban-card-create'),
    path('cards/<int:card_id>/',         views.card_detail,      name='kanban-card-detail'),
    path('cards/<int:card_id>/checklists/', views.checklist_create, name='kanban-checklist-create'),
    path('checklists/<int:cl_id>/',      views.checklist_detail, name='kanban-checklist-detail'),
    path('checklists/<int:cl_id>/items/', views.item_create,     name='kanban-item-create'),
    path('items/<int:item_id>/',         views.item_detail,      name='kanban-item-detail'),
]
