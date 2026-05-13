from django.urls import path
from users.views import (
    TestLoginView, MeView, StaffListView,
    UserManagementListCreateView, UserManagementDetailView,
)

urlpatterns = [
    path("test-login/",   TestLoginView.as_view(),               name="test_login"),
    path("me/",           MeView.as_view(),                      name="me"),
    path("staff/",        StaffListView.as_view(),               name="staff_list"),
    path("manage/",       UserManagementListCreateView.as_view(), name="user-manage-list"),
    path("manage/<uuid:pk>/", UserManagementDetailView.as_view(), name="user-manage-detail"),
]