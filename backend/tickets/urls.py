from django.urls import path
from . import views

urlpatterns = [
    path('', views.ticket_list, name='ticket-list'),
    path('<int:pk>/', views.ticket_detail, name='ticket-detail'),
    path('<int:pk>/screenshots/', views.upload_screenshot, name='ticket-screenshots'),
    path('<int:pk>/comments/', views.add_comment, name='ticket-comments'),
    path('metrics/', views.metrics, name='ticket-metrics'),
]
