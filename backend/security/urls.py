from django.urls import path

from . import views

urlpatterns = [
    path('overview/', views.overview, name='security-overview'),
    path('events/', views.event_list, name='security-events'),
    path('auth/', views.auth_activity, name='security-auth'),
    path('tokens/<int:user_id>/revoke/', views.token_revoke, name='security-token-revoke'),
    path('exposure/', views.exposure, name='security-exposure'),
    path('containers/', views.container_posture, name='security-containers'),
    path('containers/<int:container_pk>/baseline/', views.accept_baseline,
         name='security-accept-baseline'),
]
