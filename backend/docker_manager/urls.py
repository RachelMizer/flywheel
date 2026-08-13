from django.urls import path
from . import views

urlpatterns = [
    path('', views.container_list, name='container-list'),
    path('report/', views.report_containers, name='container-report'),
]
