from django.urls import path
from . import views

urlpatterns = [
    path('',                                    views.project_list,          name='projects-list'),
    path('members/',                            views.member_list,           name='projects-members'),
    path('<int:project_id>/',                   views.project_detail,        name='projects-detail'),
    path('<int:project_id>/documents/',         views.document_list,         name='projects-document-list'),
    path('documents/<int:doc_id>/',             views.document_detail,       name='projects-document-detail'),
    path('<int:project_id>/timeline/',          views.timeline_event_list,   name='projects-timeline-list'),
    path('timeline/<int:event_id>/',            views.timeline_event_detail, name='projects-timeline-detail'),
]
