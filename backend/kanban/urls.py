from django.urls import path
from . import views

urlpatterns = [
    path('activity/', views.activity_list, name='kanban-activity'),
]
